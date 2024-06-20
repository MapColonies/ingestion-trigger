import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { GeometryValidationError } from '../../../../src/ingestion/errors/ingestionErrors';
import { PolygonPartGeometryValidator } from '../../../../src/ingestion/validators/polygonPartGeometryValidator';
import { configMock, setValue, init as initConfig } from '../../../mocks/configMock';
import { infoDataMock, polygonPartsMock } from '../../../mocks/polygonPartsGeometryMock';

describe('polygonPartGeometryValidator', () => {
  let polygonPartGeometryValidator: PolygonPartGeometryValidator;

  beforeEach(() => {
    initConfig();
    setValue('validationValuesByInfo.extentBufferInMeters', 50);
    polygonPartGeometryValidator = new PolygonPartGeometryValidator(jsLogger({ enabled: false }), configMock as unknown as IConfig);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validate function', () => {
    it('all partData geometries are valid, should not throw error', () => {
      const result = () => polygonPartGeometryValidator.validate(polygonPartsMock.valid, infoDataMock);
      expect(result).not.toThrow(Error);
    });

    it('should throw geometry validation on an invalid geometry', () => {
      const result = () => polygonPartGeometryValidator.validate(polygonPartsMock.invalid.notValidGeometry, infoDataMock);
      expect(result).toThrow(GeometryValidationError);
    });

    it('should throw geometry validation on partData geometry not contained by extent', () => {
      const result = () => polygonPartGeometryValidator.validate(polygonPartsMock.invalid.notValidGeometry, infoDataMock);
      expect(result).toThrow(GeometryValidationError);
    });
  });
});
