import { faker } from '@faker-js/faker';
import { BadRequestError, ConflictError, NotFoundError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { getMapServingLayerName } from '@map-colonies/raster-shared';
import { trace } from '@opentelemetry/api';
import { container } from 'tsyringe';
import xxhashFactory from 'xxhash-wasm';
import { CHECKSUM_PROCESSOR, SERVICES } from '../../../../src/common/constants';
import { InfoManager } from '../../../../src/info/models/infoManager';
import { ChecksumError, FileNotFoundError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { Checksum } from '../../../../src/utils/hash/checksum';
import { HashProcessor } from '../../../../src/utils/hash/interfaces';
import { ValidateManager } from '../../../../src/validate/models/validateManager';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { generateCatalogLayerResponse, generateChecksum, generateNewLayerRequest, generateUpdateLayerRequest } from '../../../mocks/mockFactory';

describe('IngestionManager', () => {
  let ingestionManager: IngestionManager;

  const validateManager = {
    validateGpkgsSources: jest.fn(),
    validateShapefiles: jest.fn(),
  } satisfies Partial<ValidateManager>;

  const sourceValidator = {
    validateFilesExist: jest.fn(),
    validateGdalInfo: jest.fn(),
    validateGpkgFiles: jest.fn(),
  } satisfies Partial<SourceValidator>;

  const infoManagerMock = {
    getGpkgsInformation: jest.fn(),
  } satisfies Partial<InfoManager>;

  const geoValidatorMock = {
    validate: jest.fn(),
  };

  let createIngestionJobSpy: jest.SpyInstance;
  let findJobsSpy: jest.SpyInstance;
  let existsMapproxySpy: jest.SpyInstance;
  let existsCatalogSpy: jest.SpyInstance;
  let readSpy: jest.SpyInstance;
  let calcualteChecksumSpy: jest.SpyInstance;
  let findByIdSpy: jest.SpyInstance;
  let getGpkgsInformationSpy: jest.SpyInstance;

  let catalogClient: CatalogClient;
  let mapProxyClient: MapProxyClient;
  let jobManagerWrapper: JobManagerWrapper;
  let productManager: ProductManager;

  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    registerDefaultConfig();
    // Reset container for a clean test
    container.reset();
    container.register(SERVICES.TRACER, { useValue: testTracer });
    container.register(SERVICES.LOGGER, { useValue: testLogger });
    container.register(CHECKSUM_PROCESSOR, {
      useFactory: (): (() => Promise<HashProcessor>) => {
        return async () => {
          const xxhash = await xxhashFactory();
          return xxhash.create64();
        };
      },
    });

    mapProxyClient = new MapProxyClient(configMock, testLogger, testTracer);
    catalogClient = new CatalogClient(configMock, testLogger, testTracer);
    jobManagerWrapper = new JobManagerWrapper(configMock, testLogger, testTracer);
    productManager = new ProductManager(configMock, testLogger, testTracer);
    createIngestionJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'createIngestionJob');
    findJobsSpy = jest.spyOn(JobManagerWrapper.prototype, 'findJobs');
    existsMapproxySpy = jest.spyOn(MapProxyClient.prototype, 'exists');
    existsCatalogSpy = jest.spyOn(CatalogClient.prototype, 'exists');
    findByIdSpy = jest.spyOn(CatalogClient.prototype, 'findById');
    readSpy = jest.spyOn(ProductManager.prototype, 'read');
    calcualteChecksumSpy = jest.spyOn(Checksum.prototype, 'calculate');
    getGpkgsInformationSpy = jest.spyOn(InfoManager.prototype, 'getGpkgsInformation');

    ingestionManager = new IngestionManager(
      testLogger,
      configMock,
      testTracer,
      validateManager as unknown as ValidateManager,
      sourceValidator as unknown as SourceValidator,
      infoManagerMock as unknown as InfoManager,
      geoValidatorMock as unknown as GeoValidator,
      catalogClient,
      jobManagerWrapper,
      mapProxyClient,
      productManager
    );
  });

  afterEach(() => {
    clearConfig();
    jest.restoreAllMocks(); // Restore original implementations
  });

  describe('newLayer', () => {
    let ingestionNewJobType: string;

    beforeEach(() => {
      ingestionNewJobType = configMock.get<string>('jobManager.ingestionNewJobType');
    });

    it('should not throw any errors when the request is valid and create ingestion new job', async () => {
      const layerRequest = generateNewLayerRequest();
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      calcualteChecksumSpy.mockResolvedValue(generateChecksum());
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      const expectedResponse = { jobId: createJobResponse.id, taskId: createJobResponse.taskIds[0] };

      const response = await ingestionManager.newLayer(layerRequest);

      expect(response).toStrictEqual(expectedResponse);
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ type: ingestionNewJobType }));
    });

    it('should throw unsupported entity error when shapefile not found error', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = 'error message';
      validateManager.validateShapefiles.mockRejectedValue(new FileNotFoundError(expectedErrorMessage));

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new UnsupportedEntityError(`File ${expectedErrorMessage} does not exist`));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw unsupported entity error when gpkg files validation throws an error', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = 'errror message';
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockRejectedValue(new Error(expectedErrorMessage));

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new UnsupportedEntityError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when fails to read gpkg info', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow();
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when fails to read product shapefile', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow();
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when fails to validate product geometry against gpkg info', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockImplementation(() => {
        throw new Error();
      });

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow();
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when the layer is in MapProxy', async () => {
      const layerRequest = generateNewLayerRequest();
      const layerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);
      const expectedErrorMessage = `Failed to create new ingestion job for layer: ${layerName}, already exists on MapProxy`;
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(true);

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when MapProxy call throws an unhandled error', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(Error);
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when the layer is in catalog', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = `ProductId: ${layerRequest.metadata.productId} ProductType: ${layerRequest.metadata.productType}, already exists in catalog`;
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(true);

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when catalog call throws an unhandled error', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(Error);
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when there is a job running', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = `ProductId: ${layerRequest.metadata.productId} productType: ${layerRequest.metadata.productType}, there is at least one conflicting job already running for that layer`;
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when job manager call throws an unhandled error', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new Error());
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when checksum calcualte throws an error', async () => {
      const layerRequest = generateNewLayerRequest();
      const filePath = '';
      const expectedErrorMessage = `Failed to calculate checksum for file: ${filePath}`;
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      calcualteChecksumSpy.mockRejectedValue(new ChecksumError(expectedErrorMessage));

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ChecksumError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when job manager create new layer ingestion call throws an error', async () => {
      const layerRequest = generateNewLayerRequest();
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      calcualteChecksumSpy.mockResolvedValue(generateChecksum());
      createIngestionJobSpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new Error());
    });
  });

  describe('updateLayer', () => {
    let ingestionUpdateJobType: string;
    let ingestionSwapUpdateJobType: string;
    let ingestionSwapUpdateProductType: string;
    let ingestionSwapUpdateProductSubType: string;

    beforeEach(() => {
      ingestionUpdateJobType = configMock.get<string>('jobManager.ingestionUpdateJobType');
      ingestionSwapUpdateJobType = configMock.get<string>('jobManager.ingestionSwapUpdateJobType');
      ingestionSwapUpdateProductType = configMock.get<string>('jobManager.supportedIngestionSwapTypes[0].productType');
      ingestionSwapUpdateProductSubType = configMock.get<string>('jobManager.supportedIngestionSwapTypes[0].productSubType');
    });

    it('should not throw any errors when the request is valid and create update ingestion update job', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };
      findByIdSpy.mockResolvedValue([catalogLayerResponse]);
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([]);
      calcualteChecksumSpy.mockResolvedValue(generateChecksum());
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      const expectedResponse = { jobId: createJobResponse.id, taskId: createJobResponse.taskIds[0] };

      const response = await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      expect(response).toStrictEqual(expectedResponse);
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ type: ingestionUpdateJobType }));
    });

    it('should not throw any errors when the request is valid and create update swap job', async () => {
      const catalogLayerResponse = generateCatalogLayerResponse();
      const layerRequest = {
        ...generateUpdateLayerRequest(),
        metadata: {
          ...catalogLayerResponse.metadata,
          productType: ingestionSwapUpdateProductType,
          productSubType: ingestionSwapUpdateProductSubType,
        },
      };
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };
      findByIdSpy.mockResolvedValue([layerRequest]);
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(true);
      calcualteChecksumSpy.mockResolvedValue(generateChecksum());
      findJobsSpy.mockResolvedValue([]);
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      const expectedResponse = { jobId: createJobResponse.id, taskId: createJobResponse.taskIds[0] };

      const response = await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      expect(response).toStrictEqual(expectedResponse);
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ type: ingestionSwapUpdateJobType }));
    });

    it('should throw not found error when there is no layer in catalog', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const expectedErrorMessage = `there isn't a layer with id of ${catalogLayerResponse.metadata.id}`;
      findByIdSpy.mockResolvedValue([]);

      const promise = ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      await expect(promise).rejects.toThrow(new NotFoundError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when there is more than one layer in catalog', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const expectedErrorMessage = `found more than one layer with id of ${catalogLayerResponse.metadata.id}, please check the catalog layers`;
      findByIdSpy.mockResolvedValue([catalogLayerResponse, catalogLayerResponse]);

      const promise = ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw not found error when there is no layer in MapProxy', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const layerName = getMapServingLayerName(catalogLayerResponse.metadata.productId, catalogLayerResponse.metadata.productType);
      const expectedErrorMessage = `Failed to create update job for layer: ${layerName}, layer doesn't exist on MapProxy`;
      findByIdSpy.mockResolvedValue([catalogLayerResponse]);
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);

      const promise = ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when there is a conflicting job running', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const expectedErrorMessage = `ProductId: ${catalogLayerResponse.metadata.productId} productType: ${catalogLayerResponse.metadata.productType}, there is at least one conflicting job already running for that layer`;
      findByIdSpy.mockResolvedValue([catalogLayerResponse]);
      validateManager.validateShapefiles.mockResolvedValue(undefined);
      validateManager.validateGpkgsSources.mockResolvedValue(undefined);
      getGpkgsInformationSpy.mockResolvedValue(undefined);
      readSpy.mockResolvedValue(undefined);
      geoValidatorMock.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);

      const promise = ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });
  });

  describe('retryLayer', () => {
    let getJobSpy: jest.SpyInstance;
    let getTasksForJobSpy: jest.SpyInstance;
    let resetJobSpy: jest.SpyInstance;
    let updateTaskSpy: jest.SpyInstance;

    beforeEach(() => {
      getJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'getJob');
      getTasksForJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'getTasksForJob');
      resetJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'resetJob');
      updateTaskSpy = jest.spyOn(JobManagerWrapper.prototype, 'updateTask');
    });

    it('should reset job when validation task has no errors and job is Failed', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: OperationStatus.FAILED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: '/path/to/metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockValidationTask = {
        id: taskId,
        jobId,
        type: 'validation',
        status: OperationStatus.COMPLETED,
        parameters: {
          isValid: true,
          checksums: [],
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([mockValidationTask]);
      resetJobSpy.mockResolvedValue(undefined);

      const result = await ingestionManager.retryLayer(jobId);

      expect(result).toEqual({ jobId, taskId });
      expect(resetJobSpy).toHaveBeenCalledWith(jobId);
      expect(updateTaskSpy).not.toHaveBeenCalled();
    });

    it('should reset job when job status is COMPLETED and validation passed', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: OperationStatus.COMPLETED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: '/path/to/metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockValidationTask = {
        id: taskId,
        jobId,
        type: 'validation',
        status: OperationStatus.COMPLETED,
        parameters: {
          isValid: true,
          checksums: [],
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([mockValidationTask]);
      resetJobSpy.mockResolvedValue(undefined);

      const result = await ingestionManager.retryLayer(jobId);

      expect(result).toEqual({ jobId, taskId });
      expect(resetJobSpy).toHaveBeenCalledWith(jobId);
    });

    it('should update task with new checksums when shapefile has changed and job is COMPLETED', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();
      const existingChecksum = { fileName: 'metadata.shp', checksum: 'oldChecksum123' };
      const newChecksum = { fileName: 'metadata.shp', checksum: 'newChecksum456' };

      const mockJob = {
        id: jobId,
        status: OperationStatus.COMPLETED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: 'metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockValidationTask = {
        id: taskId,
        jobId,
        type: 'validation',
        status: OperationStatus.COMPLETED,
        parameters: {
          isValid: false,
          checksums: [existingChecksum],
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([mockValidationTask]);
      calcualteChecksumSpy.mockResolvedValue(newChecksum);
      updateTaskSpy.mockResolvedValue(undefined);

      const result = await ingestionManager.retryLayer(jobId);

      expect(result).toEqual({ jobId, taskId });
      expect(updateTaskSpy).toHaveBeenCalledWith(
        jobId,
        taskId,
        {
          parameters: {
            isValid: false,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            checksums: expect.arrayContaining([existingChecksum, newChecksum]),
          },
        }
      );
      expect(resetJobSpy).not.toHaveBeenCalled();
    });

    it('should update task with new checksums when shapefile has changed and job is FAILED', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();
      const existingChecksum = { fileName: 'metadata.shp', checksum: 'oldChecksum123' };
      const newChecksum = { fileName: 'metadata.shp', checksum: 'newChecksum456' };

      const mockJob = {
        id: jobId,
        status: OperationStatus.FAILED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: 'metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockValidationTask = {
        id: taskId,
        jobId,
        type: 'validation',
        status: OperationStatus.FAILED,
        parameters: {
          isValid: false,
          checksums: [existingChecksum],
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([mockValidationTask]);
      calcualteChecksumSpy.mockResolvedValue(newChecksum);
      updateTaskSpy.mockResolvedValue(undefined);

      const result = await ingestionManager.retryLayer(jobId);

      expect(result).toEqual({ jobId, taskId });
      expect(updateTaskSpy).toHaveBeenCalledWith(
        jobId,
        taskId,
        {
          parameters: {
            isValid: false,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            checksums: expect.arrayContaining([existingChecksum, newChecksum]),
          },
        }
      );
      expect(resetJobSpy).not.toHaveBeenCalled();
    });

    it('should throw ConflictError when shapefile has not changed', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();
      const existingChecksum = { fileName: 'metadata.shp', checksum: 'sameChecksum123' };

      const mockJob = {
        id: jobId,
        status: OperationStatus.FAILED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: 'metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockValidationTask = {
        id: taskId,
        jobId,
        type: 'validation',
        status: OperationStatus.FAILED,
        parameters: {
          isValid: false,
          checksums: [existingChecksum],
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([mockValidationTask]);
      calcualteChecksumSpy.mockResolvedValue(existingChecksum);

      await expect(ingestionManager.retryLayer(jobId)).rejects.toThrow(ConflictError);
      expect(updateTaskSpy).not.toHaveBeenCalled();
      expect(resetJobSpy).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError when metadataShapefilePath is missing', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();

      const mockJob = {
        id: jobId,
        status: OperationStatus.FAILED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: undefined,
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockValidationTask = {
        id: taskId,
        jobId,
        type: 'validation',
        status: OperationStatus.FAILED,
        parameters: {
          isValid: false,
          checksums: [{ fileName: 'metadata.shp', checksum: 'checksum123' }],
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([mockValidationTask]);

      await expect(ingestionManager.retryLayer(jobId)).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when job status is PENDING', async () => {
      const jobId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: OperationStatus.PENDING,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: '/path/to/metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };

      getJobSpy.mockResolvedValue(mockJob);

      await expect(ingestionManager.retryLayer(jobId)).rejects.toThrow(BadRequestError);
      expect(getTasksForJobSpy).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError when job status is IN_PROGRESS', async () => {
      const jobId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: OperationStatus.IN_PROGRESS,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: '/path/to/metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };

      getJobSpy.mockResolvedValue(mockJob);

      await expect(ingestionManager.retryLayer(jobId)).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError when validation task is not found', async () => {
      const jobId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: OperationStatus.FAILED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: '/path/to/metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue([]);

      await expect(ingestionManager.retryLayer(jobId)).rejects.toThrow(NotFoundError);
    });

    it('should find validation task among multiple tasks', async () => {
      const jobId = faker.string.uuid();
      const taskId = faker.string.uuid();
      const mockJob = {
        id: jobId,
        status: OperationStatus.FAILED,
        parameters: {
          inputFiles: {
            gpkgFilesPath: ['/path/to/file.gpkg'],
            metadataShapefilePath: '/path/to/metadata.shp',
            productShapefilePath: '/path/to/product.shp',
          },
        },
      };
      const mockTasks = [
        {
          id: faker.string.uuid(),
          jobId,
          type: 'other-task',
          status: OperationStatus.COMPLETED,
          parameters: {},
        },
        {
          id: taskId,
          jobId,
          type: 'validation',
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: true,
            checksums: [],
          },
        },
      ];

      getJobSpy.mockResolvedValue(mockJob);
      getTasksForJobSpy.mockResolvedValue(mockTasks);
      resetJobSpy.mockResolvedValue(undefined);

      const result = await ingestionManager.retryLayer(jobId);

      expect(result).toEqual({ jobId, taskId });
      expect(resetJobSpy).toHaveBeenCalledWith(jobId);
    });
  });
});
