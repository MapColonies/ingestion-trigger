import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import booleanContains from '@turf/boolean-contains';
import * as turf from '@turf/turf';
import { IConfig } from 'config';
import { ValidationError } from '../../../../src/ingestion/errors/ingestionErrors';
import { InfoDataWithFile } from '../../../../src/ingestion/schemas/infoDataSchema';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';

jest.mock('@turf/boolean-contains', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
    jest.resetAllMocks();
  });

  describe('validate', () => {
    it('valid correlation between gpkg footprint and product polygon footprint, should not throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      booleanContainsMock.mockReturnValue(true);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).not.toThrow();
    });

    it('invalid correlation between gpkg footprint and product polygon footprint, should throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      booleanContainsMock.mockReturnValue(false);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).toThrow(ValidationError);
    });

    it('valid correlation between gpkg footprint and product multipolygon footprint, should not throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      booleanContainsMock.mockReturnValue(true);
      const action = () => geoValidator.validate(mockInfoData, { type: 'MultiPolygon', coordinates: [[], []] });
      expect(action).not.toThrow();
    });

    it('invalid correlation between gpkg footprint and product multipolygon footprint, should throw an error', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      booleanContainsMock.mockReturnValue(false);
      const action = () => geoValidator.validate(mockInfoData, { type: 'MultiPolygon', coordinates: [[], []] });
      expect(action).toThrow(ValidationError);
    });

    it('should throw error when extent buffer of an gpkg is undefinied - case of multipolygon', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      bufferSpy.mockReturnValue(undefined);
      const action = () => geoValidator.validate(mockInfoData, { type: 'MultiPolygon', coordinates: [[], []] });
      expect(action).toThrow(/buffered gpkg extent is undefined/);
    });

    it('should throw error when extent buffer of an gpkg is undefinied - case of polygon', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      bufferSpy.mockReturnValue(undefined);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).toThrow(/buffered gpkg extent is undefined/);
    });

    it('should not throw an error when gpkg extent succesfully buffered', () => {
      const mockInfoData: InfoDataWithFile[] = [mockGdalInfoDataWithFile];
      bufferSpy.mockReturnValue(mockGdalInfoDataWithFile.extentPolygon);
      booleanContainsMock.mockReturnValue(true);
      const action = () => geoValidator.validate(mockInfoData, { type: 'Polygon', coordinates: [] });
      expect(action).not.toThrow();
    });
  });
});
