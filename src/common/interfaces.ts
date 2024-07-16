import { IRasterCatalogUpsertRequestBody, ProductType } from '@map-colonies/mc-model-types';

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

export type FindRecordResponse = IFindResponseRecord[];

export interface IUpdateRecordResponse {
  id: string;
  status: string;
}

export interface ISupportedIngestionSwapTypes {
  productType: ProductType;
  productSubType: string;
}

export interface LayerDetails {
  productId: string;
  productVersion: string;
  productType: ProductType;
  productSubType: string;
}
