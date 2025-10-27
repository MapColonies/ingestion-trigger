import { faker } from '@faker-js/faker';
import { randexp } from 'randexp';
import { ConflictError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { getMapServingLayerName, INGESTION_VALIDATIONS, RasterProductTypes } from '@map-colonies/raster-shared';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
// import { gdalInfoCases } from '../../../mocks/gdalInfoMock';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { Checksum } from '../../../../src/utils/hash/checksum';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { generateNewLayerRequest } from '../../../mocks/mockFactory';
import { fakeIngestionSources, mockInputFiles } from '../../../mocks/sourcesRequestBody';

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

  const geoValidatorMock = {
    validate: jest.fn(),
  };

  let createIngestionJobSpy: jest.SpyInstance;
  let findJobsSpy: jest.SpyInstance;
  let existsMapproxySpy: jest.SpyInstance;
  let existsCatalogSpy: jest.SpyInstance
  let readSpy: jest.SpyInstance;
  let calcualteChecksumSpy: jest.SpyInstance;

  let catalogClient: CatalogClient;
  let mapProxyClient: MapProxyClient;
  let jobManagerWrapper: JobManagerWrapper;
  let productManager: ProductManager;
  let checksum: Checksum;

  registerDefaultConfig();
  const jobManagerURL = configMock.get<string>('services.jobManagerURL');
  const catalogServiceURL = configMock.get<string>('services.catalogServiceURL');
  const mapProxyApiServiceUrl = configMock.get<string>('services.mapProxyApiServiceUrl');
  const fakeProductId = faker.helpers.fromRegExp(randexp(INGESTION_VALIDATIONS.productId.pattern));
  const fakeProductType = faker.helpers.enumValue(RasterProductTypes);
  const layerName = getMapServingLayerName(fakeProductId, fakeProductType);
  const catalogPostIdAndType = {
    metadata: { productId: fakeProductId, productType: fakeProductType },
  };
  const forbiddenJobTypesForParallelIngestion = configMock.get<string[]>('jobManager.forbiddenJobTypesForParallelIngestion');
  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    registerDefaultConfig();

    mapProxyClient = new MapProxyClient(configMock, testLogger, testTracer);
    catalogClient = new CatalogClient(configMock, testLogger, testTracer);
    jobManagerWrapper = new JobManagerWrapper(configMock, testLogger, testTracer);
    productManager = new ProductManager(configMock, testLogger, testTracer);
    createIngestionJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'createIngestionJob');
    findJobsSpy = jest.spyOn(JobManagerWrapper.prototype, 'findJobs');
    existsMapproxySpy = jest.spyOn(MapProxyClient.prototype, 'exists');
    existsCatalogSpy = jest.spyOn(CatalogClient.prototype, 'exists');
    readSpy = jest.spyOn(ProductManager.prototype, 'read');
    calcualteChecksumSpy = jest.spyOn(Checksum.prototype, 'calculate');

    ingestionManager = new IngestionManager(
      testLogger,
      configMock,
      testTracer,
      sourceValidator as unknown as SourceValidator,
      gdalInfoManagerMock as unknown as GdalInfoManager,
      geoValidatorMock as unknown as GeoValidator,
      catalogClient,
      jobManagerWrapper,
      mapProxyClient,
      productManager,
    );
  });

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });

  describe('newLayer', () => {
    it('should not throw any errors when the request is valid', async () => {
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] }
      const layerRequest = generateNewLayerRequest();
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(checksum);
      createIngestionJobSpy.mockResolvedValue(createJobResponse)

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
    });

    it('should throw conflict error when there is a job running', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([[{ status: OperationStatus.IN_PROGRESS }]]);

      const action = async () => ingestionManager.newLayer(layerRequest);

      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in mapProxy', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(true);

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in catalog', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(true);
      existsCatalogSpy.mockResolvedValue(true);

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw unsupported entity error when sources validation fails', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0]));

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).rejects.toThrow(UnsupportedEntityError);
    });
  });

  describe('validateUpdateLayer', () => {
    it('should not throw any errors when the request is valid and create update job', async () => {
      const layerRequest = generateNewLayerRequest();
      const updatedLayerMetadata = updatedLayer.metadata;
      const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      geoValidatorMock.validate.mockReturnValue(() => void 0);

      const getJobsParams = {
        resourceId: updatedLayerMetadata.productId,
        productType: updatedLayerMetadata.productType,
        isCleaned: false,
        shouldReturnTasks: false,
        statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
        types: forbiddenJobTypesForParallelIngestion,
      };

          nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(200, []);
          nock(jobManagerURL).post('/jobs', updateJobRequest).reply(200, jobResponse);
          nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(200, [updatedLayer]);
          nock(mapProxyApiServiceUrl)
            .get(`/layer/${encodeURIComponent(updateLayerName)}`)
            .reply(200);

          const action = async () => {
            await ingestionManager.updateLayer(updatedLayerMetadata.id, layerRequest);
          };
          await expect(action()).resolves.not.toThrow();
        });

      //   it('should not throw any errors when the request is valid and create update swap job', async () => {
      //     const layerRequest = updateLayerRequest.valid;
      //     const updatedLayerMetadata = updatedSwapLayer.metadata;
      //     const updateLayerName = getMapServingLayerName(fakeProductId, fakeProductType);

      //     sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      //     geoValidatorMock.validate.mockReturnValue(() => void 0);

      //     const getJobsParams = {
      //       resourceId: updatedLayerMetadata.productId,
      //       productType: updatedLayerMetadata.productType,
      //       isCleaned: false,
      //       shouldReturnTasks: false,
      //       statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
      //       types: forbiddenJobTypesForParallelIngestion,
      //     };

      //     nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(200, []);
      //     nock(jobManagerURL).post('/jobs', updateSwapJobRequest).reply(200, jobResponse);
      //     nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(200, [updatedSwapLayer]);
      //     nock(mapProxyApiServiceUrl)
      //       .get(`/layer/${encodeURIComponent(updateLayerName)}`)
      //       .reply(200);

      //     const action = async () => {
      //       await ingestionManager.updateLayer(updatedLayerMetadata.id, layerRequest);
      //     };
      //     await expect(action()).resolves.not.toThrow();
      //   });

      //   it('should throw conflict error when there is a conflicting job running', async () => {
      //     const layerRequest = updateLayerRequest.valid;
      //     const updatedLayerMetadata = updatedLayer.metadata;
      //     const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

      //     sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      //     geoValidatorMock.validate.mockReturnValue(() => void 0);

      //     const getJobsParams = {
      //       resourceId: updatedLayerMetadata.productId,
      //       productType: updatedLayerMetadata.productType,
      //       isCleaned: false,
      //       shouldReturnTasks: false,
      //       statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
      //       types: forbiddenJobTypesForParallelIngestion,
      //     };

      //     nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(200, updateRunningJobResponse);
      //     nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(200, [updatedLayer]);
      //     nock(mapProxyApiServiceUrl)
      //       .get(`/layer/${encodeURIComponent(updateLayerName)}`)
      //       .reply(200);

      //     const action = async () => {
      //       await ingestionManager.updateLayer(updatedLayerMetadata.id, layerRequest);
      //     };

      //     await expect(action()).rejects.toThrow(ConflictError);
      //   });

      //   it('should throw not found error when there is no layer in mapProxy', async () => {
      //     const layerRequest = updateLayerRequest.valid;
      //     const updatedLayerMetadata = updatedLayer.metadata;
      //     const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

      //     sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      //     geoValidatorMock.validate.mockReturnValue(() => void 0);

      //     const getJobsParams = {
      //       resourceId: updatedLayerMetadata.productId,
      //       productType: updatedLayerMetadata.productType,
      //       isCleaned: false,
      //       shouldReturnTasks: false,
      //       statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
      //       types: forbiddenJobTypesForParallelIngestion,
      //     };

      //     nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(200, []);
      //     nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(200, [updatedLayer]);
      //     nock(mapProxyApiServiceUrl)
      //       .get(`/layer/${encodeURIComponent(updateLayerName)}`)
      //       .reply(404);

      //     const action = async () => {
      //       await ingestionManager.updateLayer(updatedLayerMetadata.id, layerRequest);
      //     };

      //     await expect(action()).rejects.toThrow(NotFoundError);
      //   });

      //   it('should throw conflict error when there is more then one layer in catalog', async () => {
      //     const layerRequest = updateLayerRequest.valid;
      //     const updatedLayerMetadata = updatedLayer.metadata;

      //     sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      //     geoValidatorMock.validate.mockReturnValue(() => void 0);

      //     nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(200, [updatedLayer, updatedLayer]);

      //     const action = async () => {
      //       await ingestionManager.updateLayer(updatedLayerMetadata.id, layerRequest);
      //     };

      //     await expect(action()).rejects.toThrow(ConflictError);
      //   });

      //   it('should throw not found error when there is no layer in catalog', async () => {
      //     const layerRequest = updateLayerRequest.valid;
      //     const updatedLayerMetadata = updatedLayer.metadata;

      //     sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      //     sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      //     geoValidatorMock.validate.mockReturnValue(() => void 0);

      //     nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(200, []);

      //     const action = async () => {
      //       await ingestionManager.updateLayer(updatedLayerMetadata.id, layerRequest);
      //     };

      //     await expect(action()).rejects.toThrow(NotFoundError);
      //   });
    });

    describe('validateSources', () => {
      it('should return successfully validation response when all validations pass', async () => {
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGpkgFiles.mockImplementation((async () => Promise.resolve()));

        const response = await ingestionManager.validateSources(mockInputFiles);

        expect(response).toEqual({ isValid: true, message: 'Sources are valid' });
      });

      it('should return failed validation response due to file is not exists', async () => {
        sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0]));

        const response = await ingestionManager.validateSources(mockInputFiles);

        expect(response).toEqual({ isValid: false, message: `File ${mockInputFiles.gpkgFilesPath[0]} does not exist` });
      });

      it('should return failed validation response when gdal info validation throws an error', async () => {
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while validating gdal info')));

        const response = await ingestionManager.validateSources(mockInputFiles);

        expect(response).toEqual({ isValid: false, message: 'Error while validating gdal info' });
      });

      it('should return failed validation response when gpkg validation throws an error', async () => {
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGpkgFiles.mockImplementation(() => {
          throw new GpkgError('Error while validating gpkg files');
        });

        const response = await ingestionManager.validateSources(mockInputFiles);

        expect(response).toEqual({ isValid: false, message: 'Error while validating gpkg files' });
      });

      it('should throw an error when an unexpected error is thrown', async () => {
        const inputFiles = fakeIngestionSources.validSources.validInputFiles;
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
        sourceValidator.validateGpkgFiles.mockImplementation(() => {
          throw new Error('Unexpected error');
        });

        await expect(ingestionManager.validateSources(mockInputFiles)).rejects.toThrow('Unexpected error');
      });
    });

    describe('getInfoData', () => {
      it('should return gdal info data when files exist and are valid', async () => {
        const mockGdalInfoDataArr = [mockGdalInfoData];
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
        gdalInfoManagerMock.getInfoData.mockResolvedValue(mockGdalInfoDataArr);

        const result = await ingestionManager.getInfoData(mockInputFiles);

        expect(result).toEqual(mockGdalInfoDataArr);
      });

      it('should throw an error when file exists throws an error due to file not found', async () => {
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.reject(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0])));

        await expect(ingestionManager.getInfoData(mockInputFiles)).rejects.toThrow(FileNotFoundError);
      });

      it('should throw an error when getInfoData throws GdalInfoError', async () => {
        sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
        gdalInfoManagerMock.getInfoData.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while getting gdal info')));

        await expect(ingestionManager.getInfoData(mockInputFiles)).rejects.toThrow(GdalInfoError);
      });
    });
  });
