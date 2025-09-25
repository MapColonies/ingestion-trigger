import { IRasterCatalogUpsertRequestBody, TileOutputFormat } from '@map-colonies/mc-model-types';
import type { RasterProductTypes } from '@map-colonies/raster-shared';
import { Polygon } from 'geojson';

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
  productType: RasterProductTypes;
  productSubType: string;
}

export interface LayerDetails {
  productId: string;
  productVersion: string;
  productType: RasterProductTypes;
  productSubType: string;
  tileOutputFormat: TileOutputFormat;
  displayPath: string;
  productName: string;
  footprint: Polygon;
}
