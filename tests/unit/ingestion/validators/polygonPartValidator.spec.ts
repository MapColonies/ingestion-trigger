import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { GeometryValidationError, PixelSizeError } from '../../../../src/ingestion/errors/ingestionErrors';
import { PolygonPartValidator } from '../../../../src/ingestion/validators/polygonPartValidator';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { infoDataMock, polygonPartsMock } from '../../../mocks/polygonPartsMock';

describe('PolygonPartValidator', () => {
  let polygonPartValidator: PolygonPartValidator;

  beforeEach(() => {
    registerDefaultConfig();
    polygonPartValidator = new PolygonPartValidator(jsLogger({ enabled: false }), configMock);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validate function', () => {
    it('all partData geometries and pixel sizes are valid, should not throw error', () => {
      const result = () => polygonPartValidator.validate(polygonPartsMock.valid, infoDataMock);
      expect(result).not.toThrow(Error);
    });

    it('should throw geometry validation error on an invalid geometry', () => {
      const result = () => polygonPartValidator.validate(polygonPartsMock.invalid.notValidGeometry, infoDataMock);
      expect(result).toThrow(GeometryValidationError);
    });

    it('should throw geometry validation error on partData geometry not contained by extent', () => {
      const result = () => polygonPartValidator.validate(polygonPartsMock.invalid.notContainedGeometry, infoDataMock);
      expect(result).toThrow(GeometryValidationError);
    });

    it('should throw geometry validation error on partData multipolygon geometry not contained by extent', () => {
      const result = () => polygonPartValidator.validate(polygonPartsMock.invalid.notContainedMultiPolygon, infoDataMock);
      expect(result).toThrow(GeometryValidationError);
    });

    it('should throw pixelSize validation error on partData when resolutionDeg isnt greater than pixelSize from infoData', () => {
      const result = () => polygonPartValidator.validate(polygonPartsMock.invalid.notValidResolutionDeg, infoDataMock);
      expect(result).toThrow(PixelSizeError);
    });
  });
});
