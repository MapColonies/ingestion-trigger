import { faker } from '@faker-js/faker';
import { BadRequestError, ConflictError, NotFoundError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { RasterProductTypes } from '@map-colonies/raster-shared';
import { Xxh64 } from '@node-rs/xxhash';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { container } from 'tsyringe';
import { CHECKSUM_PROCESSOR, SERVICES } from '../../../../src/common/constants';
import { ChecksumError, FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { HashAlgorithm, HashProcessor } from '../../../../src/utils/hash/interface';
import { Checksum } from '../../../../src/utils/hash/checksum';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';
import { generateCatalogLayerResponse, generateNewLayerRequest, generateUpdateLayerRequest } from '../../../mocks/mockFactory';

describe('IngestionManager', () => {
  let ingestionManager: IngestionManager;
  const sourceValidator = {
    validateFilesExist: jest.fn(),
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
  let existsCatalogSpy: jest.SpyInstance;
  let readSpy: jest.SpyInstance;
  let calcualteChecksumSpy: jest.SpyInstance;
  let findByIdSpy: jest.SpyInstance;
  let validateGpkgsSpy: jest.SpyInstance;

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
      useFactory: (): HashProcessor => {
        return Object.assign(new Xxh64(), { algorithm: 'XXH64' as const satisfies HashAlgorithm });
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
    validateGpkgsSpy = jest.spyOn(IngestionManager.prototype, 'validateGpkgs');

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
    it('should not throw any errors when the request is valid and create ingestion new job', async () => {
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };
      const layerRequest = generateNewLayerRequest();
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(faker.string.sample());
      createIngestionJobSpy.mockResolvedValue(createJobResponse);

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ "type": "Ingestion_New" }));
    });

    it('should throw conflict error when there is a job running', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);

      const action = async () => ingestionManager.newLayer(layerRequest);

      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw conflict error when the layer is in mapProxy', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
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
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(true);

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw unsupported entity error when sources validation fails due to file not found error', async () => {
      const layerRequest = generateNewLayerRequest();

      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0]));

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).rejects.toThrow(UnsupportedEntityError);
    });

    it('should throw an error when checksum calcualte throws an error', async () => {
      const layerRequest = generateNewLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockRejectedValue(new ChecksumError(''));

      const action = async () => {
        await ingestionManager.newLayer(layerRequest);
      };
      await expect(action()).rejects.toThrow(ChecksumError);
    });
  });

  describe('updateLayer', () => {
    it('should not throw any errors when the request is valid and create update ingestion update job', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] }

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([catalogLayerResponse])
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([]);
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(faker.string.sample());

      const action = async () => {
        await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ "type": "Ingestion_Update" }));
    });

    it('should not throw any errors when the request is valid and create update swap job', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const swapLayer = {
        ...catalogLayerResponse,
        metadata: { ...catalogLayerResponse.metadata, productType: RasterProductTypes.RASTER_VECTOR_BEST, productSubType: 'testProductSubType' }
      };
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] }

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([swapLayer]);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([]);
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(faker.string.sample());

      const action = async () => {
        await ingestionManager.updateLayer(swapLayer.metadata.id, layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ "type": "Ingestion_Swap_Update" }));
    });

    it('should throw conflict error when there is a conflicting job running', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([catalogLayerResponse]);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(faker.string.sample());

      const action = async () => {
        await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw not found error when there is no layer in mapProxy', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([catalogLayerResponse]);
      existsMapproxySpy.mockResolvedValue(false);

      const action = async () => {
        await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(NotFoundError);
    });

    it('should throw conflict error when there is more then one layer in catalog', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([catalogLayerResponse, catalogLayerResponse]);

      const action = async () => {
        await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw not found error when there is no layer in catalog', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockReturnValue(() => void 0);

      findByIdSpy.mockResolvedValue([]);

      const action = async () => {
        await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(NotFoundError);
    });
  });

  describe('validateSources', () => {
    it('should return successfully validation response when all validations pass', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());

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
      validateGpkgsSpy.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while validating gdal info')));

      const response = await ingestionManager.validateSources(mockInputFiles);

      expect(response).toEqual({ isValid: false, message: 'Error while validating gdal info' });
    });

    it('should return failed validation response when gpkg validation throws an error', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(() => {
        throw new GpkgError('Error while validating gpkg files');
      });

      const response = await ingestionManager.validateSources(mockInputFiles);

      expect(response).toEqual({ isValid: false, message: 'Error while validating gpkg files' });
    });

    it('should throw an error when an unexpected error is thrown', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(() => {
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

    describe('validation without errors (isValid: true)', () => {
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

      it('should not reset job when job status is COMPLETED and validation passed', async () => {
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
        expect(resetJobSpy).not.toHaveBeenCalledWith(jobId);
      });
    });

    describe('validation with errors (isValid: false)', () => {
      it('should update task with new checksums when shapefile has changed', async () => {
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

        //add same check when job is Failed and make sure it does not reset

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
    });

    describe('job status validation', () => {
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
    });

    describe('validation task retrieval', () => {
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
});
