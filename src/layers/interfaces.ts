import { BBox } from '@turf/helpers';

export interface IPublishMapLayerRequest {
  name: string;
  tilesPath: string;
  maxZoomLevel: number;
  cacheType: PublishedMapLayerCacheType;
}

export enum PublishedMapLayerCacheType {
  FS = 'file',
  S3 = 's3',
  GPKG = 'geopackage',
}

export interface ITaskParameters {
  discreteId: string;
  version: string;
  originDirectory: string;
  minZoom: number;
  maxZoom: number;
  layerRelativePath: string;
  bbox: BBox;
}
