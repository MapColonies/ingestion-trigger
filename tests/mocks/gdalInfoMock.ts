/* eslint-disable @typescript-eslint/no-magic-numbers */
import { Polygon } from 'geojson';
import { InfoData } from '../../src/ingestion/schemas/infoDataSchema';

export const gdalInfoCases = {
  validGdalInfo: {
    crs: 4326,
    extentPolygon: {
      coordinates: [
        [
          [-180, 90],
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
        ],
      ],
      type: 'Polygon',
    },
    fileFormat: 'GPKG',
    fileName: 'validBlueMarble.gpkg',
    pixelSize: 0.0439453125,
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
} as Record<string, InfoData>;
