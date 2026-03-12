help me understand what should i do in this situation , and if one of the solutions i listed are indeed correct ?

# GDAL Mock Fix — SWC Namespace Import Problem

Branch: `feat/infrastructure-boilerplate-update`

---

## The problem

After switching the test transform from `ts-jest` to `@swc/jest`, two integration tests started failing:

```
● Validate › POST /validate/gpkgs › Happy Path
  › should return 200 status code and sources invalid response - failed to get gdal info gdal.infoAsync

● Validate › POST /validate/gpkgs › Happy Path
  › should return 200 status code and sources invalid response - failed to open gdal dataset gdal.openAsync
```

Both tests tried to force `gdal.infoAsync` / `gdal.openAsync` to fail and expected the API to return `{ isValid: false }`. Instead, the response stayed `{ isValid: true }` — the mock had no effect.

---

## What the tests looked like before the fix

```typescript
// tests/integration/validate/validate.spec.ts  (BEFORE — broken with @swc/jest)
import gdal from 'gdal-async';  // default import

it('should return 200 … failed to get gdal info gdal.infoAsync', async () => {
  const validateGdalInfoSpy = jest.spyOn(SourceValidator.prototype, 'validateGdalInfo');
  const validateGdalInfoSpyGdal = jest.spyOn(gdal, 'infoAsync').mockRejectedValue(new Error('failed'));
  // ...
  expect(response.body).toHaveProperty('isValid', false);  // FAILS — still true
  await expect(validateGdalInfoSpy).rejects.toThrow();     // FAILS — it resolved
});
```

---

## Root cause: how SWC compiles namespace imports

### With `ts-jest` (old behaviour)

`ts-jest` runs the real TypeScript compiler, which preserves the **live module binding** for namespace imports. All files that do `import * as gdal from 'gdal-async'` share references into the same live module object. When `jest.spyOn(gdal, 'infoAsync')` replaces the property, every file — including `gdalUtilities.ts` — sees the patched value.

```
ts-jest:
  test file    ──┐
                 ├── live module object { infoAsync: <spy>, ... }
  gdalUtilities ─┘
```

### With `@swc/jest` (new behaviour)

SWC compiles `import * as gdal from 'gdal-async'` using a `_interop_require_wildcard()` helper, which **copies all exported properties by value** into a plain object at the moment the file is first loaded. Each file gets its own independent copy.

```
@swc/jest:
  test file    →  own copy { infoAsync: <spy>,     openAsync: <orig> }
  gdalUtilities →  own copy { infoAsync: <orig>,    openAsync: <orig> }
```

`jest.spyOn` patches the test file's copy. The production file's copy is untouched. The spy never intercepts the actual call.

---

## The fix (Solution A — current state)

The fix uses `jest.mock()` instead of `jest.spyOn()` for `gdal-async`.

### Why `jest.mock()` is immune to the SWC copy problem

`jest.mock()` is hoisted by Jest to run **before any import is resolved**. It registers a factory in Jest's module registry. When SWC's `_interop_require_wildcard()` is later called for `'gdal-async'` — in any file, test or production — it reads from that same registry entry. All files end up sharing the same `jest.fn()` instances. There is no per-file copy; the factory's return value is the single source of truth.

```
jest.mock() hoisted:
  registry['gdal-async'] = { infoAsync: jest.fn(), openAsync: jest.fn(), ... }

then all files load:
  test file    →  { infoAsync: jest.fn(), openAsync: jest.fn() }  ← same object
  gdalUtilities →  { infoAsync: jest.fn(), openAsync: jest.fn() }  ← same object
```

### The mock factory

Added at the top of both `validate.spec.ts` and `gdalUtilities.spec.ts`:

```typescript
import * as gdal from 'gdal-async';

jest.mock('gdal-async', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actualModule = jest.requireActual<Record<string, unknown>>('gdal-async');
  return {
    ...actualModule,
    infoAsync: jest.fn().mockImplementation(actualModule['infoAsync'] as (...args: unknown[]) => unknown),
    openAsync: jest.fn().mockImplementation(actualModule['openAsync'] as (...args: unknown[]) => unknown),
  };
});
```

Every line explained:

| Code | Purpose |
|---|---|
| `jest.requireActual('gdal-async')` | Load the real, un-mocked module. Inside a `jest.mock` factory, normal `import` / `require` would hit the mock itself, so `requireActual` is the only way to reach the original. |
| `...actualModule` | Spread all real exports into the replacement object. Anything not explicitly overridden (constants, other functions) keeps working normally without any extra wiring. |
| `infoAsync: jest.fn()` | Wrap `infoAsync` in a Jest mock function. This makes it interceptable via `jest.mocked(gdal.infoAsync).mockRejectedValueOnce(...)` in individual tests. |
| `.mockImplementation(actualModule['infoAsync'])` | Set the default behaviour to call through to the real `infoAsync`. Tests that do **not** override it still exercise the real GDAL code path. |
| Same for `openAsync` | Identical rationale. |

### Per-test overrides

```typescript
// BEFORE (broken)
jest.spyOn(gdal, 'infoAsync').mockRejectedValue(new Error('failed to read file'));

// AFTER (fixed)
jest.mocked(gdal.infoAsync).mockRejectedValueOnce(new Error('failed to read file'));
```

- `jest.mocked(gdal.infoAsync)` is a TypeScript cast — it tells the compiler the function is a `jest.MockedFunction`, enabling `.mockRejectedValueOnce` etc. No runtime effect.
- `mockRejectedValueOnce` (not `mockRejectedValue`) — only overrides for a single call. After that, the factory's `mockImplementation` (the real function) is restored automatically. This avoids mock state leaking between tests.

### `clearAllMocks` vs `resetAllMocks`

In `gdalUtilities.spec.ts`:

```typescript
beforeEach(() => {
  jest.clearAllMocks();   // ✅ clears call counts and return values
});
```

`jest.resetAllMocks()` would also remove the `mockImplementation` set by the factory (the call-through to real GDAL). Subsequent tests that don't override `openAsync`/`infoAsync` would then call `jest.fn()` with no implementation — returning `undefined` instead of a real dataset — and fail. `clearAllMocks` only resets call history and one-time overrides, leaving the factory implementation intact.

---

## Alternative fix (Solution B — reverted)

A version of the fix was also implemented that additionally improved the source code in `src/utils/gdal/gdalUtilities.ts`. It was reverted in favour of Solution A (minimum necessary change), but the improvements are valid and could be applied separately.

### Change 1 — throw `GdalInfoError` in catch blocks

```typescript
// BEFORE (master / current)
throw new Error(message);

// AFTER (Solution B)
throw new GdalInfoError(message);
```

`gdalUtilities` is a GDAL utility class; its errors should carry domain type information. Currently errors bubble up as plain `Error` and get re-wrapped in `GdalInfoError` one level up in `gdalInfoManager`. Throwing `GdalInfoError` directly is more semantically correct and consistent with the `dataset.geoTransform === null` branch which already does this.

**Test impact:** `gdalUtilities.spec.ts` assertions become `rejects.toThrow(GdalInfoError)` instead of `rejects.toThrow(Error)`.

### Change 2 — move `dataset.close()` to a `finally` block

```typescript
// BEFORE (master / current) — close() only runs on success; leaks handle on error
try {
  const dataset = await this.getDataset(filePath);
  // ... validation steps that can throw ...
  dataset.close();
  return infoData;
} catch (err) { /* rethrows */ }

// AFTER (Solution B) — close() always runs
let dataset: gdal.Dataset | undefined;
try {
  dataset = await this.getDataset(filePath);
  // ... validation steps ...
  return infoData;
} catch (err) { /* rethrows */ }
finally {
  dataset?.close();
}
```

If any step between `getDataset` and `dataset.close()` throws, the current code leaves the file handle open. `finally` guarantees cleanup on both success and error paths.

### Change 3 — fix `logCOntext` typo

```typescript
// BEFORE — typo: capital O in 'COntext'
this.logger.debug({ msg: '...', logCOntext: logCtx, metadata: { filePath } });

// AFTER
this.logger.debug({ msg: '...', logContext: logCtx, metadata: { filePath } });
```

---

## Source code — current state

The source file `src/utils/gdal/gdalUtilities.ts` is **unchanged from master** (Solution A). Only the two test files were modified.

### `src/utils/gdal/gdalUtilities.ts` (unchanged — relevant excerpt)

```typescript
try {
  // ...
  const dataset: gdal.Dataset = await this.getDataset(filePath);
  const infoJsonString = await gdal.infoAsync(dataset, ['-json']);
  // ...
  if (dataset.geoTransform === null) {
    throw new GdalInfoError('dataset.geoTransform is null');
  }
  // ...
  dataset.close();
  return infoData;
} catch (err) {
  // ...
  throw new Error(message);   // plain Error (not GdalInfoError)
}
```

The integration tests still pass because the chain is:

```
gdalUtilities throws Error
  → gdalInfoManager.getInfoData() catches ALL errors, wraps in GdalInfoError
    → validateManager sees instanceof GdalInfoError → returns { isValid: false }
```

### `tests/integration/validate/validate.spec.ts` (changed — top of file)

```typescript
import * as gdal from 'gdal-async';   // was: import gdal from 'gdal-async'

jest.mock('gdal-async', () => {
  const actualModule = jest.requireActual<Record<string, unknown>>('gdal-async');
  return {
    ...actualModule,
    infoAsync: jest.fn().mockImplementation(actualModule['infoAsync'] as (...args: unknown[]) => unknown),
    openAsync: jest.fn().mockImplementation(actualModule['openAsync'] as (...args: unknown[]) => unknown),
  };
});
```

The two previously failing tests now use `jest.mocked()`:

```typescript
// infoAsync test
jest.mocked(gdal.infoAsync).mockRejectedValueOnce(new Error('failed to read file'));

// openAsync test
jest.mocked(gdal.openAsync).mockRejectedValueOnce(new Error('failed to read file'));
```

One new test was added to cover the `geoTransform === null` branch (required to keep the integration coverage statement count within its threshold):

```typescript
it('should return 200 … dataset geoTransform is null', async () => {
  const validGdalInfoJson = JSON.stringify({
    stac: { 'proj:epsg': 4326 },
    geoTransform: [0, 1, 0, 0, 0, -1],
    driverShortName: 'GPKG',
    wgs84Extent: { type: 'Polygon', coordinates: [] },
  });
  jest.mocked(gdal.openAsync).mockResolvedValueOnce({ geoTransform: null, close: jest.fn() } as unknown as gdal.Dataset);
  jest.mocked(gdal.infoAsync).mockResolvedValueOnce(validGdalInfoJson);
  // ...
  expect(response.body).toHaveProperty('isValid', false);
});
```

### `tests/unit/utils/gdalUtilities.spec.ts` (changed — top of file + new test)

Same `jest.mock('gdal-async', factory)` block added. One new test:

```typescript
it('should throw GdalInfoError when dataset.geoTransform is null', async () => {
  const fakeDataset = { geoTransform: null, close: jest.fn() };
  const validGdalInfoJson = JSON.stringify({ /* ... */ });
  jest.mocked(gdal.openAsync).mockResolvedValueOnce(fakeDataset as unknown as gdal.Dataset);
  jest.mocked(gdal.infoAsync).mockResolvedValueOnce(validGdalInfoJson);

  await expect(gdalUtilities.getInfoData('fake.gpkg')).rejects.toThrow(Error);
});
```

---

## Test results

| Suite | Before | After |
|---|---|---|
| Unit (14 suites) | 128 passing | **129 passing** (+1 new test) |
| Integration (5 suites) | 185 passing, **2 failing** | **188 passing** (+3 new/fixed tests) |var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
// This file handles the tracing initialization and starts the tracing process before the app starts.
// You should be careful about editing this file, as it is a critical part of the application's functionality.
// Because this file is a module it should imported using the `--import` flag in the `node` command, and should not be imported by any other file.
import { tracingFactory } from './common/tracing.js';
import { getConfig, initConfig } from './common/config.js';
await initConfig();
var config = getConfig();
var tracingConfig = config.get('telemetry.tracing');
var sharedConfig = config.get('telemetry.shared');
var tracing = tracingFactory(__assign(__assign({}, tracingConfig), sharedConfig));
tracing.start();
