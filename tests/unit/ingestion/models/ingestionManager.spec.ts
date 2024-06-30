import jsLogger from '@map-colonies/js-logger';
import nock from 'nock';
import { ConflictError } from '@map-colonies/error-types';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { fakeIngestionSources } from '../../../mocks/sourcesRequestBody';
import { jobResponse, newJobRequest, newLayerRequest, runningJobResponse } from '../../../mocks/newIngestionRequestMockData';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { gdalInfoCases } from '../../../mocks/gdalInfoMock';
import { PolygonPartValidator } from '../../../../src/ingestion/validators/polygonPartValidator';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../../mocks/configMock';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { getMapServingLayerName } from '../../../../src/utils/layerNameGenerator';

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

  const polygonPartValidatorMock = {
    validate: jest.fn(),
  };

  let catalogClient: CatalogClient;
  let mapProxyClient: MapProxyClient;
  let jobManagerWrapper: JobManagerWrapper;

  let jobManagerURL = '';
  let catalogServiceURL = '';
  let mapProxyApiServiceUrl = '';
  let layerName = '';
  let catalogPostBody = {};

  beforeEach(() => {
    registerDefaultConfig();
    catalogServiceURL = configMock.get<string>('services.catalogServiceURL');
    mapProxyApiServiceUrl = configMock.get<string>('services.mapProxyApiServiceUrl');
    jobManagerURL = configMock.get<string>('services.jobManagerURL');

    layerName = getMapServingLayerName(newLayerRequest.valid.metadata.productId, newLayerRequest.valid.metadata.productType);
    catalogPostBody = { metadata: { productId: newLayerRequest.valid.metadata.productId, productType: newLayerRequest.valid.metadata.productType } };

    mapProxyClient = new MapProxyClient(configMock, jsLogger({ enabled: false }));
    catalogClient = new CatalogClient(configMock, jsLogger({ enabled: false }));
    jobManagerWrapper = new JobManagerWrapper(configMock, jsLogger({ enabled: false }));

    ingestionManager = new IngestionManager(
      jsLogger({ enabled: false }),
      configMock,
      sourceValidator as unknown as SourceValidator,
      gdalInfoManagerMock as unknown as GdalInfoManager,
      polygonPartValidatorMock as unknown as PolygonPartValidator,
      catalogClient,
      jobManagerWrapper,
      mapProxyClient
    );
  });

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });

  describe('validateNewLayerIngestion', () => {
    it('should not throw any errors when the request is valid', async () => {
      const layerRequest = newLayerRequest.valid;

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartValidatorMock.validate.mockReturnValue(() => void 0);

      const getJobsParams = {
        resourceId: layerRequest.metadata.productId,
        productType: layerRequest.metadata.productType,
        isCleaned: false,
        shouldReturnTasks: false,
      };
      nock(jobManagerURL).get('/jobs').query(getJobsParams).reply(200, []);
      nock(jobManagerURL).post('/jobs', newJobRequest).reply(200, jobResponse);
      nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(200, []);
      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(404);

      const action = async () => {
        await ingestionManager.validateIngestion(layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
    });

    it('should throw conflict error when there is a job running', async () => {
      const layerRequest = newLayerRequest.valid;

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartValidatorMock.validate.mockReturnValue(() => void 0);

      const getJobsParams = {
        resourceId: layerRequest.metadata.productId,
        productType: layerRequest.metadata.productType,
        isCleaned: false,
        shouldReturnTasks: false,
      };
      nock(jobManagerURL).get('/jobs').query(getJobsParams).reply(200, runningJobResponse);
      nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(200, []);
      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(404);

      const action = async () => ingestionManager.validateIngestion(layerRequest);

      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in mapProxy', async () => {
      const layerRequest = newLayerRequest.valid;

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartValidatorMock.validate.mockReturnValue(() => void 0);

      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(200, []);

      const action = async () => {
        await ingestionManager.validateIngestion(layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in catalog', async () => {
      const layerRequest = newLayerRequest.valid;

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      polygonPartValidatorMock.validate.mockReturnValue(() => void 0);

      nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(200, ['1']);
      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(404);

      const action = async () => {
        await ingestionManager.validateIngestion(layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw unsupported entity error when sources validation fails', async () => {
      const layerRequest = newLayerRequest.valid;
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.reject(new FileNotFoundError(layerRequest.inputFiles.fileNames[0])));

      const action = async () => {
        await ingestionManager.validateIngestion(layerRequest);
      };
      await expect(action()).rejects.toThrow(UnsupportedEntityError);
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
