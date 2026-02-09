import type { RasterProductTypes } from '@map-colonies/raster-shared';

export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface OpenApiConfig {
  filePath: string;
  basePath: string;
  jsonPath: string;
  uiPath: string;
}

export interface ISupportedIngestionSwapTypes {
  productType: RasterProductTypes;
  productSubType: string;
}

export interface LogContext {
  fileName: string;
  class: string;
  function?: string;
}
