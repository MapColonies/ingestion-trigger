import { BadRequestError } from '@map-colonies/error-types';
import { IConfig } from 'config';
import { DependencyContainer } from 'tsyringe';
import { getApp } from '../../../../src/app';
import { GPKG_REGEX } from '../../../../src/ingestion/schemas/inputFilesSchema';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { fakeDataToValidate } from '../../../mocks/schemasValidatorMockData';
import { SERVICES } from '../../../../src/common/constants';
import { PixelRange } from '../../../../src/ingestion/interfaces';
import { pixelSizeRange } from '../../../../src/ingestion/schemas/infoDataSchema';

let schemasValidator: SchemasValidator;
let appContainer: DependencyContainer;

describe('SchemasValidator', () => {
  beforeEach(function () {
    const [, container] = getApp();
    appContainer = container;
    schemasValidator = appContainer.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validateInputFilesRequestBody', () => {
    it('should return valid inputFiles', async () => {
      const requestBody = fakeDataToValidate.inputFiles.valid;

      const result = await schemasValidator.validateInputFilesRequestBody(requestBody);

      expect(result).toHaveProperty('originDirectory');
      expect(typeof result.originDirectory).toBe('string');
      expect(result).toHaveProperty('fileNames');
      expect(Array.isArray(result.fileNames)).toBe(true);
      expect(result.fileNames).toHaveLength(1);
      expect(result.fileNames[0]).toMatch(GPKG_REGEX);
    });

    it('should throw error when fails validate input files- Directory Not Supplied', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.directoryNotSupplied;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Files Not Supplied', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.filesNotSupplied;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Too Many Files', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.tooManyFiles;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Wrong Suffix', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.wrongSuffix;
      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });

  describe('validateInfoData', () => {
    it('should return valid Info Data', async () => {
      const infoData = fakeDataToValidate.infoData.valid;

      const config = appContainer.resolve<IConfig>(SERVICES.CONFIG);
      const validCRSs = config.get<number[]>('validationValuesByInfo.crs');
      const validFormats = config.get<string[]>('validationValuesByInfo.fileFormat').map((format) => format.toLowerCase());

      const result = await schemasValidator.validateInfoData(infoData);

      expect(result).toHaveProperty('crs');
      expect(typeof result.crs).toBe('number');
      expect(validCRSs).toContain(result.crs);
      expect(result).toHaveProperty('fileFormat');
      expect(typeof result.fileFormat).toBe('string');
      expect(validFormats).toContain(result.fileFormat);
      expect(result).toHaveProperty('pixelSize');
      expect(typeof result.pixelSize).toBe('number');
      expect(result.pixelSize).toBeGreaterThanOrEqual(pixelSizeRange.min);
      expect(result.pixelSize).toBeLessThanOrEqual(pixelSizeRange.max);
      expect(result).toHaveProperty('extentPolygon');
      expect(typeof result.extentPolygon).toBe('object');
    });

    it('should throw error when fails validate info data- Unsupported CRS', async () => {
      const infoData = fakeDataToValidate.infoData.invalid.invalidCrs;

      const validationAction = async () => schemasValidator.validateInfoData(infoData);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Unsupported Format', async () => {
      const infoData = fakeDataToValidate.infoData.invalid.invalidFileFormat;

      const validationAction = async () => schemasValidator.validateInfoData(infoData);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Unsupported pixel size', async () => {
      const infoData = fakeDataToValidate.infoData.invalid.invalidPixelSize;

      const validationAction = async () => schemasValidator.validateInfoData(infoData);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });
});
