import { faker } from '@faker-js/faker';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { RasterProductTypes } from '@map-colonies/raster-shared';
import { Xxh64 } from '@node-rs/xxhash';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { container } from 'tsyringe';
import { CHECKSUM_PROCESSOR, SERVICES } from '../../../../src/common/constants';
import { GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { ChecksumError, FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { Checksum } from '../../../../src/utils/hash/checksum';
import { HashAlgorithm, HashProcessor } from '../../../../src/utils/hash/interface';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { generateCatalogLayerResponse, generateNewLayerRequest, generateUpdateLayerRequest } from '../../../mocks/mockFactory';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';

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
  let jobResponse: ICreateJobResponse;

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

    jobResponse = {
      id: faker.string.uuid(),
      taskIds: [faker.string.uuid()],
    };

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
      productManager
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
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'Ingestion_New' }));
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
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.resolve());
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([catalogLayerResponse]);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([]);
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(faker.string.sample());

      const action = async () => {
        await ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'Ingestion_Update' }));
    });

    it('should not throw any errors when the request is valid and create update swap job', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const catalogLayerResponse = generateCatalogLayerResponse();
      const swapLayer = {
        ...catalogLayerResponse,
        metadata: { ...catalogLayerResponse.metadata, productType: RasterProductTypes.RASTER_VECTOR_BEST, productSubType: 'testProductSubType' },
      };
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };

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
      expect(createIngestionJobSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'Ingestion_Swap_Update' }));
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

      const response = await ingestionManager.validateGpkgs({ gpkgFilesPath: mockInputFiles.gpkgFilesPath });

      expect(response).toEqual({ isValid: true, message: 'Sources are valid' });
    });

    it('should return failed validation response due to file is not exists', async () => {
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0]));

      const response = await ingestionManager.validateGpkgs({ gpkgFilesPath: mockInputFiles.gpkgFilesPath });

      expect(response).toEqual({ isValid: false, message: `File ${mockInputFiles.gpkgFilesPath[0]} does not exist` });
    });

    it('should return failed validation response when gdal info validation throws an error', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while validating gdal info')));

      const response = await ingestionManager.validateGpkgs({ gpkgFilesPath: mockInputFiles.gpkgFilesPath });

      expect(response).toEqual({ isValid: false, message: 'Error while validating gdal info' });
    });

    it('should return failed validation response when gpkg validation throws an error', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(() => {
        throw new GpkgError('Error while validating gpkg files');
      });

      const response = await ingestionManager.validateGpkgs({ gpkgFilesPath: mockInputFiles.gpkgFilesPath });

      expect(response).toEqual({ isValid: false, message: 'Error while validating gpkg files' });
    });

    it('should throw an error when an unexpected error is thrown', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      validateGpkgsSpy.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      await expect(ingestionManager.validateGpkgs({ gpkgFilesPath: mockInputFiles.gpkgFilesPath })).rejects.toThrow('Unexpected error');
    });
  });

  describe('getInfoData', () => {
    it('should return gdal info data when files exist and are valid', async () => {
      const mockGdalInfoDataArr = [mockGdalInfoData];
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockResolvedValue(mockGdalInfoDataArr);

      const result = await ingestionManager.getGpkgsInfo({ gpkgFilesPath: mockInputFiles.gpkgFilesPath });

      expect(result).toEqual(mockGdalInfoDataArr);
    });

    it('should throw an error when file exists throws an error due to file not found', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.reject(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0])));

      await expect(ingestionManager.getGpkgsInfo({ gpkgFilesPath: mockInputFiles.gpkgFilesPath })).rejects.toThrow(FileNotFoundError);
    });

    it('should throw an error when getInfoData throws GdalInfoError', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while getting gdal info')));

      await expect(ingestionManager.getGpkgsInfo({ gpkgFilesPath: mockInputFiles.gpkgFilesPath })).rejects.toThrow(GdalInfoError);
    });
  });
});
