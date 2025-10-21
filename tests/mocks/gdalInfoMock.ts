/* eslint-disable @typescript-eslint/no-magic-numbers */
import { InfoDataWithFile } from '../../src/ingestion/schemas/infoDataSchema';

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
  fileFormat: "gpkg",
  gpkgFilePath: '/path/to/blue_marble.gpkg',
  pixelSize: 0.0439453125,
};
