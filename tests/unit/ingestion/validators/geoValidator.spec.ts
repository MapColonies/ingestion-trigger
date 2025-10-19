import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { trace } from '@opentelemetry/api';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { InfoDataWithFile } from '../../../../src/ingestion/schemas/infoDataSchema';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { Polygon } from 'geojson';
import { ValidationError } from '../../../../src/ingestion/errors/ingestionErrors';
import booleanContains from '@turf/boolean-contains';
import { extentBuffer } from '../../../../src/utils/geometry';
import * as turf from '@turf/turf';

jest.mock('@turf/boolean-contains', () => ({
  __esModule: true,
  default: jest.fn(),
}));


describe('GeoValidator', () => {
  let geoValidator: GeoValidator;
  let booleanContainsMock: jest.Mock;
  let bufferSpy: jest.SpyInstance;

  beforeEach(() => {
    registerDefaultConfig();
    geoValidator = new GeoValidator(jsLogger({ enabled: false }), configMock as unknown as IConfig, trace.getTracer('testTracer'));
    booleanContainsMock = booleanContains as jest.Mock;
    bufferSpy = jest.spyOn(turf, 'buffer');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks()
  });

  describe('validate', () => {
    it('valid correlation between gpkg footprint and product polygon footprint, should not throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      booleanContainsMock.mockReturnValue(true);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).not.toThrow();
    });

    it('invalid correlation between gpkg footprint and product polygon footprint, should throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      booleanContainsMock.mockReturnValue(false);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).toThrow(ValidationError);
    });

    it('valid correlation between gpkg footprint and product multipolygon footprint, should not throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      booleanContainsMock.mockReturnValue(true);
      const action = () => geoValidator.validate(mockInfoData, { type: 'MultiPolygon', coordinates: [[], []] });
      expect(action).not.toThrow();
    });

    it('invalid correlation between gpkg footprint and product multipolygon footprint, should throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      booleanContainsMock.mockReturnValue(false);
      const action = () => geoValidator.validate(mockInfoData, { type: 'MultiPolygon', coordinates: [[], []] });
      expect(action).toThrow(ValidationError);
    });

    it('should throw error when extent buffer of an gpkg is undefinied', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      booleanContainsMock.mockReturnValue(false);
      const action = () => geoValidator.validate(mockInfoData, { type: 'MultiPolygon', coordinates: [[], []] });
      expect(action).toThrow(ValidationError);
    });

    it('should throw error when extent buffer of an gpkg is undefinied', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      bufferSpy.mockReturnValue(undefined);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).toThrow(/buffered gpkg extent is undefined/);
    });

    it('should not throw an error when gpkg extent succesfully buffered', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoData];
      bufferSpy.mockReturnValue(mockGdalInfoData.extentPolygon);
      booleanContainsMock.mockReturnValue(true);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).not.toThrow();
    });
  });
});
