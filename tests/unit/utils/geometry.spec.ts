import { ProductType } from '@map-colonies/mc-model-types';
import { Feature, GeoJsonProperties, MultiPolygon, Polygon } from 'geojson';
import { combineExtentPolygons, extentBuffer } from '../../../src/utils/geometry';
import { init as initMockConfig } from '../../mocks/configMock';
import { bufferedGeometry } from '../../mocks/test_files/bufferedGeometry';

const extent: Feature<Polygon | MultiPolygon> = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [34.61517, 34.10156],
        [34.61517, 32.242124],
        [36.4361539, 32.242124],
        [36.4361539, 34.10156],
        [34.61517, 34.10156],
      ],
    ],
  },
  properties: {},
};

describe('geometryUtils', () => {
  beforeEach(function () {
    jest.resetAllMocks();
    initMockConfig();
  });

  describe('check buffer function', () => {
    it('Check extent buffer is working correctly', function () {
      const buffer: number = 50;
      const extendedFeature = extentBuffer(buffer, extent);
      expect(extendedFeature).toBeDefined();
      expect(extendedFeature).toEqual(bufferedGeometry);
    });
  });
});
