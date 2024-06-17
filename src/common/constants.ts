import { readPackageJsonSync } from '@map-colonies/read-pkg';
import { zoomLevelToResolutionDeg, zoomLevelToResolutionMeter } from '@map-colonies/mc-utils';

export const SERVICE_NAME = readPackageJsonSync().name ?? 'unknown_service';
export const DEFAULT_SERVER_PORT = 80;

export const IGNORED_OUTGOING_TRACE_ROUTES = [/^.*\/v1\/metrics.*$/];
export const IGNORED_INCOMING_TRACE_ROUTES = [/^.*\/docs.*$/];

/* eslint-disable @typescript-eslint/naming-convention */
export const SERVICES = {
  LOGGER: Symbol('Logger'),
  CONFIG: Symbol('Config'),
  TRACER: Symbol('Tracer'),
  METER: Symbol('Meter'),
} satisfies Record<string, symbol>;
/* eslint-enable @typescript-eslint/naming-convention */

/* eslint-disable @typescript-eslint/no-magic-numbers */
export const PRODUCT_ID_REGEX = new RegExp('^[a-zA-Z0-9_-]+$');
export const GPKG_REGEX = new RegExp('^.+.[Gg][Pp][Kk][Gg]$');
export const CLASSIFICATION_REGEX = new RegExp('^[0-9]$|^[1-9][0-9]$|^(100)$');
export const resolutionMeterRange = { min: zoomLevelToResolutionMeter(22), max: zoomLevelToResolutionMeter(0) };
export const resolutionDegRange = { min: zoomLevelToResolutionDeg(22), max: zoomLevelToResolutionDeg(0) };
export const horizontalAccuracyCE90Range = { min: 0.01, max: 4000 };
export const scaleRange = { min: 0, max: 100000000 };
/* eslint-enable @typescript-eslint/no-magic-numbers */
