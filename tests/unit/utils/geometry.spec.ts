import { Feature, Polygon } from 'geojson';
import { extentBuffer, extractPolygons, combineExtentPolygons } from '../../../src/utils/geometry';
import { init as initMockConfig } from '../../mocks/configMock';
import { bufferedGeometry } from '../../mocks/testFiles/bufferedGeometry';
import { InfoData } from '../../../src/ingestion/schemas/infoDataSchema';
import { infoDataArray, expectedExtractedPolygons, expectedCombined } from '../../mocks/schemasValidatorMockData';

const extent: Feature<Polygon> = {
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

  it('Check extent buffer is working correctly', function () {
    const buffer: number = 50;
    const extendedFeature = extentBuffer(buffer, extent);
    expect(extendedFeature).toBeDefined();
    expect(extendedFeature).toEqual(bufferedGeometry);
  });

  it('check than ExtractPolygons is working correctly', function () {
    const extractedFromInfoArray = extractPolygons(infoDataArray as InfoData[]);
    expect(extractedFromInfoArray).toEqual(expectedExtractedPolygons);
  });

  it('check that combinePolygons is working correctly', function () {
    const extractedFromInfoArray = extractPolygons(infoDataArray as InfoData[]);
    const combined = combineExtentPolygons(extractedFromInfoArray);
    expect(combined).toHaveProperty('type');
    expect(combined.type).toBe('Feature');
    expect(combined).toHaveProperty('geometry');
    expect(combined.geometry).toHaveProperty('type');
    expect(combined.geometry).toHaveProperty('coordinates');
    expect(combined.geometry.type).toEqual(expectedCombined.geometry.type);
    expect(combined.geometry.coordinates).toEqual(expectedCombined.geometry.coordinates);
  });
});
