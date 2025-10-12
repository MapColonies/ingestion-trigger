/* eslint-disable @typescript-eslint/no-magic-numbers */
import { Polygon } from 'geojson';
import { InfoData, InfoDataWithFile } from '../../src/ingestion/schemas/infoDataSchema';
import { faker } from '@faker-js/faker';

export const mockGdalInfoData: InfoDataWithFile = {
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
  gpkgFilePath: '/path/to/blue_marble.gpkg',
  pixelSize: 0.0439453125,
};
