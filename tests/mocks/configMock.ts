import config from 'config';
import get from 'lodash.get';
import has from 'lodash.has';
import { IConfig } from '../../src/common/interfaces';

let mockConfig: Record<string, unknown> = {};
const getMock = jest.fn();
const hasMock = jest.fn();

const configMock: IConfig = {
  get: getMock,
  has: hasMock,
};

const init = (): void => {
  getMock.mockImplementation((key: string): unknown => {
    return mockConfig[key] ?? config.get(key);
  });
};

const setValue = (key: string | Record<string, unknown>, value?: unknown): void => {
  if (typeof key === 'string') {
    mockConfig[key] = value;
  } else {
    mockConfig = { ...mockConfig, ...key };
  }
};

const clear = (): void => {
  mockConfig = {};
};

const setConfigValues = (values: Record<string, unknown>): void => {
  getMock.mockImplementation((key: string) => {
    const value: unknown = (get as (object: Record<string, unknown>, path: string) => unknown)(values, key) ?? config.get(key);
    return value;
  });
  hasMock.mockImplementation((key: string) => (has as (object: Record<string, unknown>, path: string) => boolean)(values, key) || config.has(key));
};

const registerDefaultConfig = (): void => {
  const EPSG = 4326;
  const config = {
    openapiConfig: {
      filePath: './bundledApi.yaml',
      basePath: '/docs',
      rawPath: '/api',
      uiPath: '/api',
    },
    telemetry: {
      logger: {
        level: 'info',
        prettyPrint: false,
      },
    },
    server: {
      port: '8080',
      request: {
        payload: {
          limit: '1mb',
        },
      },
      response: {
        compression: {
          enabled: true,
          options: null,
        },
      },
    },
    storageExplorer: {
      layerSourceDir: 'tests/mocks',
      displayNameDir: '\\layerSources',
      watchDirectory: 'watch',
      validFileExtensions: ['gpkg'],
    },

    validationValuesByInfo: {
      crs: [EPSG],
      fileFormat: ['GPKG'],
      pixelSizeRange: {
        min: 1.67638e-7,
        max: 0.703125,
      },
      tileSize: 256,
      resolutionFixedPointTolerance: 12,
      extentBufferInMeters: 50,
    },
  };

  setConfigValues(config);
};

export { getMock, hasMock, configMock, setValue, clear, init, setConfigValues, registerDefaultConfig };
