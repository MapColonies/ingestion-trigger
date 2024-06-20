import jsLogger from '@map-colonies/js-logger';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { ConflictError } from '@map-colonies/error-types';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { fakeIngestionSources } from '../../../mocks/sourcesRequestBody';
import { jobResponse, newLayerRequest } from '../../../mocks/newLayerRequestMock';
import { FileNotFoundError, GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { gdalInfoCases } from '../../../mocks/gdalInfoMock';
import { PolygonPartGeometryValidator } from '../../../../src/ingestion/validators/polygonPartGeometryValidator';
import { configMock, init as initConfig } from '../../../mocks/configMock';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';

describe('IngestionManager', () => {
  let ingestionManager: IngestionManager;
  const sourceValidator = {
    validateFilesExist: jest.fn(),
    validateGdalInfo: jest.fn(),
    validateGpkgFiles: jest.fn(),
  };

  const gdalInfoManagerMock = {
    getInfoData: jest.fn(),
    validateInfoData: jest.fn(),
  };

  const polygonPartGeometryValidatorMock = {
    validate: jest.fn(),
  };

  const catalogClientMock = {
    exists: jest.fn(),
  };
  const jobManagerWrapperMock = {
    createInitJob: jest.fn(),
    createNewJob: jest.fn(),
    createTask: jest.fn(),
    updateJobById: jest.fn(),
    getJobs: jest.fn(),
  };
  const mapProxyClientMock = {
    exists: jest.fn(),
  };

  beforeEach(() => {
    initConfig();
    ingestionManager = new IngestionManager(
      jsLogger({ enabled: false }),
      configMock,
      sourceValidator as unknown as SourceValidator,
      gdalInfoManagerMock as unknown as GdalInfoManager,
      polygonPartGeometryValidatorMock as unknown as PolygonPartGeometryValidator,
      catalogClientMock as unknown as CatalogClient,
      jobManagerWrapperMock as unknown as JobManagerWrapper,
      mapProxyClientMock as unknown as MapProxyClient
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    //jest.resetAllMocks();
  });

  describe('validateNewLayerIngestion', () => {
    it('should not throw any errors when the request is valid', () => {
      const layerRequest = newLayerRequest.valid;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartGeometryValidatorMock.validate.mockReturnValue(() => void 0);
      catalogClientMock.exists.mockResolvedValue(false);
      jobManagerWrapperMock.createInitJob.mockResolvedValue(jobResponse);
      jobManagerWrapperMock.getJobs.mockResolvedValue([]);
      mapProxyClientMock.exists.mockResolvedValue(false);

      const response = async () => ingestionManager.validateIngestion(layerRequest);

      expect(response).not.toThrow(Error);
    });

    it('should throw conflict error when there is a job running', async () => {
      const layerRequest = newLayerRequest.valid;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartGeometryValidatorMock.validate.mockReturnValue(() => void 0);
      catalogClientMock.exists.mockResolvedValue(false);
      jobManagerWrapperMock.createInitJob.mockResolvedValue(jobResponse);
      jobManagerWrapperMock.getJobs.mockResolvedValue([{ status: OperationStatus.PENDING, type: 'Ingestion_New' }]);
      mapProxyClientMock.exists.mockResolvedValue(false);

      const response = async () => ingestionManager.validateIngestion(layerRequest);

      await expect(response).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in mapProxy', async () => {
      const layerRequest = newLayerRequest.valid;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartGeometryValidatorMock.validate.mockReturnValue(() => void 0);
      catalogClientMock.exists.mockResolvedValue(false);
      jobManagerWrapperMock.createInitJob.mockResolvedValue(jobResponse);
      jobManagerWrapperMock.getJobs.mockResolvedValue([{ status: OperationStatus.PENDING, type: 'Ingestion_New' }]);
      mapProxyClientMock.exists.mockResolvedValue(true);

      const response = async () => ingestionManager.validateIngestion(layerRequest);

      await expect(response).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in catalog', async () => {
      const layerRequest = newLayerRequest.valid;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartGeometryValidatorMock.validate.mockReturnValue(() => void 0);
      catalogClientMock.exists.mockResolvedValue(true);
      jobManagerWrapperMock.createInitJob.mockResolvedValue(jobResponse);
      jobManagerWrapperMock.getJobs.mockResolvedValue([{ status: OperationStatus.PENDING, type: 'Ingestion_New' }]);
      mapProxyClientMock.exists.mockResolvedValue(false);

      const response = async () => ingestionManager.validateIngestion(layerRequest);

      await expect(response).rejects.toThrow(ConflictError);
    });
  });

  describe('validateSources', () => {
    it('should return SourcesValidationResponse with isValid true and message Sources are valid when all validations pass', async () => {
      const inputFiles = fakeIngestionSources.validSources.validInputFiles;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);

      const response = await ingestionManager.validateSources(inputFiles);

      expect(response).toEqual({ isValid: true, message: 'Sources are valid' });
    });

    it('should return SourcesValidationResponse with isValid false and message error message when validateFilesExist throws FileNotFoundError', async () => {
      const inputFiles = fakeIngestionSources.invalidSources.filesNotExist;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.reject(new FileNotFoundError(inputFiles.fileNames[0])));

      const response = await ingestionManager.validateSources(inputFiles);

      expect(response).toEqual({ isValid: false, message: `File ${inputFiles.fileNames[0]} does not exist` });
    });

    it('should return SourcesValidationResponse with isValid false and message error message when validateGdalInfo throws GdalInfoError', async () => {
      const inputFiles = fakeIngestionSources.invalidSources.unsupportedCrs;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while validating gdal info')));

      const response = await ingestionManager.validateSources(inputFiles);

      expect(response).toEqual({ isValid: false, message: 'Error while validating gdal info' });
    });

    it('should return SourcesValidationResponse with isValid false and message error message when validateGpkgFiles throws GdalInfoError', async () => {
      const inputFiles = fakeIngestionSources.invalidSources.unsupportedCrs;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockImplementation(() => {
        throw new GpkgError('Error while validating gpkg files');
      });

      const response = await ingestionManager.validateSources(inputFiles);

      expect(response).toEqual({ isValid: false, message: 'Error while validating gpkg files' });
    });

    it('should throw an error when an unexpected error is thrown', async () => {
      const inputFiles = fakeIngestionSources.validSources.validInputFiles;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(ingestionManager.validateSources(inputFiles)).rejects.toThrow('Unexpected error');
    });
  });

  describe('getInfoData', () => {
    it('should return gdal info data when files exist and are valid', async () => {
      const inputFiles = fakeIngestionSources.validSources.validInputFiles;
      const mockGdalInfoData = [gdalInfoCases.validGdalInfo];

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockResolvedValue(mockGdalInfoData);

      const result = await ingestionManager.getInfoData(inputFiles);

      expect(result).toEqual(mockGdalInfoData);
    });

    it('should throw an error when validateFilesExist throws FileNotFoundError', async () => {
      const inputFiles = fakeIngestionSources.invalidSources.filesNotExist;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.reject(new FileNotFoundError(inputFiles.fileNames[0])));

      await expect(ingestionManager.getInfoData(inputFiles)).rejects.toThrow(FileNotFoundError);
    });

    it('should throw an error when getInfoData throws GdalInfoError', async () => {
      const inputFiles = fakeIngestionSources.invalidSources.unsupportedCrs;
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while getting gdal info')));

      await expect(ingestionManager.getInfoData(inputFiles)).rejects.toThrow(GdalInfoError);
    });
  });
});
