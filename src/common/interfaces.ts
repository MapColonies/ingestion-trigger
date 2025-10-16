import { IRasterCatalogUpsertRequestBody } from '@map-colonies/mc-model-types';
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

export interface IFindResponseRecord extends IRasterCatalogUpsertRequestBody {
  id: string;
}

export interface IUpdateRecordResponse {
  id: string;
  status: string;
}

export interface ISupportedIngestionSwapTypes {
  productType: RasterProductTypes;
  productSubType: string;
}
