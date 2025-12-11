import { faker } from '@faker-js/faker';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { FileNotFoundError, GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { ValidateManager } from '../../../../src/validate/models/validateManager';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

describe('ValidateManager', () => {
  let validateManager: ValidateManager;

  const sourceValidator = {
    validateFilesExist: jest.fn(),
    validateGdalInfo: jest.fn(),
    validateGpkgFiles: jest.fn(),
  } satisfies Partial<SourceValidator>;

  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    registerDefaultConfig();

    validateManager = new ValidateManager(testLogger, configMock, testTracer, sourceValidator as unknown as SourceValidator);
  });

  afterEach(() => {
    clearConfig();
    jest.restoreAllMocks(); // Restore original implementations
  });

  describe('validateGpkgs', () => {
    it('should return successfully validation response when all validations pass', async () => {
      sourceValidator.validateFilesExist.mockResolvedValue(undefined);
      sourceValidator.validateGdalInfo.mockResolvedValue(undefined);
      sourceValidator.validateGpkgFiles.mockReturnValue(undefined);

      const response = await validateManager.validateGpkgs({ gpkgFilesPath: generateInputFiles().gpkgFilesPath });

      expect(response).toStrictEqual({ isValid: true, message: 'Sources are valid' });
    });

    it('should throw file not fount error when file does not exists', async () => {
      const validateGpkgRequest = { gpkgFilesPath: generateInputFiles().gpkgFilesPath };
      const expectedError = validateGpkgRequest.gpkgFilesPath[0];
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(expectedError));

      const promise = validateManager.validateGpkgs(validateGpkgRequest);

      await expect(promise).rejects.toThrow(new FileNotFoundError(expectedError));
    });

    it('should return failed validation response when gdal info validation throws an error', async () => {
      const validateGpkgRequest = { gpkgFilesPath: generateInputFiles().gpkgFilesPath };
      const expectedError = 'Error while validating gpkg files';
      sourceValidator.validateFilesExist.mockResolvedValue(undefined);
      sourceValidator.validateGdalInfo.mockRejectedValue(new GdalInfoError(expectedError));

      const response = await validateManager.validateGpkgs(validateGpkgRequest);

      expect(response).toStrictEqual({ isValid: false, message: expectedError });
    });

    it('should return failed validation response when gpkg validation throws an error', async () => {
      const validateGpkgRequest = { gpkgFilesPath: generateInputFiles().gpkgFilesPath };
      const expectedError = 'Error while validating gpkg files';
      sourceValidator.validateFilesExist.mockResolvedValue(undefined);
      sourceValidator.validateGdalInfo.mockResolvedValue(undefined);
      sourceValidator.validateGpkgFiles.mockImplementation(() => {
        throw new GpkgError(expectedError);
      });

      const response = await validateManager.validateGpkgs(validateGpkgRequest);

      expect(response).toStrictEqual({ isValid: false, message: expectedError });
    });

    it('should return failed validation response when gpkg validation throws unexpected error', async () => {
      const validateGpkgRequest = { gpkgFilesPath: generateInputFiles().gpkgFilesPath };
      const expectedError = 'error';
      sourceValidator.validateFilesExist.mockResolvedValue(undefined);
      sourceValidator.validateGdalInfo.mockResolvedValue(undefined);
      sourceValidator.validateGpkgFiles.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw { error: expectedError };
      });

      const promise = validateManager.validateGpkgs(validateGpkgRequest);

      await expect(promise).rejects.toEqual({ error: expectedError });
    });
  });

  describe('validateShapefiles', () => {
    it('should return successfully validation response when all validations pass', async () => {
      const shapefilePaths = [generateInputFiles().metadataShapefilePath];
      sourceValidator.validateFilesExist.mockResolvedValue(undefined);

      const promise = validateManager.validateShapefiles(shapefilePaths);

      await expect(promise).resolves.not.toThrow();
    });

    it('should throw file not fount error when file does not exists', async () => {
      const shapefilePaths = faker.helpers.multiple(() => generateInputFiles().metadataShapefilePath);
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(shapefilePaths));

      const promise = validateManager.validateShapefiles(shapefilePaths);

      await expect(promise).rejects.toThrow(new FileNotFoundError(shapefilePaths));
    });

    it('should throw file not fount error when file is invalid', async () => {
      const shapefilePaths = faker.helpers.multiple(() => generateInputFiles().metadataShapefilePath);
      const expectedError = 'error';
      sourceValidator.validateFilesExist.mockRejectedValue(new Error(expectedError));

      const promise = validateManager.validateShapefiles(shapefilePaths);

      await expect(promise).rejects.toThrow(new Error(expectedError));
    });

    it('should throw file not fount error when unexpected error occures', async () => {
      const shapefilePaths = faker.helpers.multiple(() => generateInputFiles().metadataShapefilePath);
      const expectedError = 'error';
      sourceValidator.validateFilesExist.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw { error: expectedError };
      });

      const promise = validateManager.validateShapefiles(shapefilePaths);

      await expect(promise).rejects.toEqual({ error: expectedError });
    });
  });
});
