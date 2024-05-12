import { Polygon } from 'geojson';
import { InfoData } from '../../src/ingestion/schemas/infoDataSchema';

export const gdalInfoCases = {
  validGdalInfo: {
    crs: 4326,
    extentPolygon: {} as Polygon,
    fileFormat: 'GPKG',
    pixelSize: 0.055656,
  },
  unsupportedCrs: {
    crs: 3857,
    extentPolygon: {} as Polygon,
    fileFormat: 'GPKG',
    pixelSize: 0.055656,
  },
  unsupportedFileFormat: {
    crs: 3857,
    extentPolygon: {} as Polygon,
    fileFormat: 'TIFF',
    pixelSize: 0.055656,
  },
  unsupportedPixelSize: {
    crs: 4326,
    extentPolygon: {} as Polygon,
    fileFormat: 'GPKG',
    pixelSize: 0.9,
  },
} satisfies Record<string, InfoData>;
