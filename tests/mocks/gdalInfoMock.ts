/* eslint-disable @typescript-eslint/no-magic-numbers */
import { InfoData, InfoDataWithFile } from '../../src/ingestion/schemas/infoDataSchema';

export const mockGdalInfoData: InfoData = {
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
  fileFormat: 'gpkg',
  pixelSize: 0.0439453125,
}

export const mockGdalInfoDataWithFile: InfoDataWithFile = { ...mockGdalInfoData, fileName: '/path/to/blue_marble.gpkg' };
