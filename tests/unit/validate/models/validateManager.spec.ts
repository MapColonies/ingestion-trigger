import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { container } from 'tsyringe';
import { SERVICES } from '../../../../src/common/constants';
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
    // Reset container for a clean test
    container.reset();
    container.register(SERVICES.TRACER, { useValue: testTracer });
    container.register(SERVICES.LOGGER, { useValue: testLogger });

    validateManager = new ValidateManager(testLogger, configMock, testTracer, sourceValidator as unknown as SourceValidator);
  });

  afterEach(() => {
    clearConfig();
    jest.restoreAllMocks(); // Restore original implementations
  });

  describe('validateGpkgs', () => {
    it('should return successfully validation response when all validations pass', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(undefined);

      const response = await validateManager.validateGpkgs({ gpkgFilesPath: generateInputFiles().gpkgFilesPath });

      expect(response).toStrictEqual({ isValid: true, message: 'Sources are valid' });
    });

    it('should return failed validation response due to file is not exists', async () => {
      const validateGpkgRequest = { gpkgFilesPath: generateInputFiles().gpkgFilesPath };
      const expectedError = validateGpkgRequest.gpkgFilesPath[0];
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(expectedError));

      const response = await validateManager.validateGpkgs(validateGpkgRequest);

      expect(response).toStrictEqual({ isValid: false, message: `File ${expectedError} does not exist` });
    });

    it('should return failed validation response when gdal info validation throws an error', async () => {
      sourceValidator.validateFilesExist.mockResolvedValue(undefined);
      sourceValidator.validateGdalInfo.mockRejectedValue(new GdalInfoError('Error while validating gdal info'));

      const response = await validateManager.validateGpkgs({ gpkgFilesPath: generateInputFiles().gpkgFilesPath });

      expect(response).toStrictEqual({ isValid: false, message: 'Error while validating gdal info' });
    });

    it('should return failed validation response when gpkg validation throws an error', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockImplementation(() => {
        throw new GpkgError('Error while validating gpkg files');
      });

      const response = await validateManager.validateGpkgs({ gpkgFilesPath: generateInputFiles().gpkgFilesPath });

      expect(response).toStrictEqual({ isValid: false, message: 'Error while validating gpkg files' });
    });
  });
});
