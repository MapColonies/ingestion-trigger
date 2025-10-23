import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { GpkgError } from '../../../../src/serviceClients/database/errors';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { Xxh64 } from '@node-rs/xxhash';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';
import {
  updatedLayer,
  updatedSwapLayer,
} from '../../../mocks/updateRequestMockData';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import { Checksum } from '../../../../src/utils/hash/checksum';
import { HASH_ALGORITHM } from '../../../../src/utils/hash/constants';
import { faker } from '@faker-js/faker';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { generateNewLayerRequest, generateUpdateLayerRequest } from '../../../mocks/mockFactory';

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
  let findByIdSpy: jest.SpyInstance;

  let catalogClient: CatalogClient;
  let mapProxyClient: MapProxyClient;
  let jobManagerWrapper: JobManagerWrapper;
  let productManager: ProductManager;
  let checksum: Checksum;

  registerDefaultConfig();
  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    registerDefaultConfig();

    mapProxyClient = new MapProxyClient(configMock, testLogger, testTracer);
    catalogClient = new CatalogClient(configMock, testLogger, testTracer);
    jobManagerWrapper = new JobManagerWrapper(configMock, testLogger, testTracer);
    productManager = new ProductManager(configMock, testLogger, testTracer);
    checksum = new Checksum(configMock, testLogger, testTracer, Object.assign(new Xxh64(), { algorithm: HASH_ALGORITHM[0] }));
    createIngestionJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'createIngestionJob');
    findJobsSpy = jest.spyOn(JobManagerWrapper.prototype, 'findJobs');
    existsMapproxySpy = jest.spyOn(MapProxyClient.prototype, 'exists');
    existsCatalogSpy = jest.spyOn(CatalogClient.prototype, 'exists');
    findByIdSpy = jest.spyOn(CatalogClient.prototype, 'findById');
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
      checksum
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
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);

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
      const layerRequest = generateUpdateLayerRequest();
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] }

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());


      findByIdSpy.mockResolvedValue([updatedLayer])
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([]);
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(checksum);

      const action = async () => {
        await ingestionManager.updateLayer(updatedLayer.metadata.id, layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
    });

    it('should not throw any errors when the request is valid and create update swap job', async () => {
      const layerRequest = generateUpdateLayerRequest();
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] }

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());


      findByIdSpy.mockResolvedValue([updatedSwapLayer]);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([]);
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(checksum);

      const action = async () => {
        await ingestionManager.updateLayer(updatedSwapLayer.metadata.id, layerRequest);
      };
      await expect(action()).resolves.not.toThrow();
    });

    it('should throw conflict error when there is a conflicting job running', async () => {
      const layerRequest = generateUpdateLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([updatedLayer]);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);
      readSpy.mockImplementation(undefined);
      calcualteChecksumSpy.mockResolvedValue(checksum);

      const action = async () => {
        await ingestionManager.updateLayer(updatedLayer.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw not found error when there is no layer in mapProxy', async () => {
      const layerRequest = generateUpdateLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([updatedLayer]);
      existsMapproxySpy.mockResolvedValue(false);

      const action = async () => {
        await ingestionManager.updateLayer(updatedLayer.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(NotFoundError);
    });

    it('should throw conflict error when there is more then one layer in catalog', async () => {
      const layerRequest = generateUpdateLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(0);
      geoValidatorMock.validate.mockImplementation(async () => Promise.resolve());

      findByIdSpy.mockResolvedValue([updatedLayer, updatedLayer]);

      const action = async () => {
        await ingestionManager.updateLayer(updatedLayer.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(ConflictError);
    });

    it('should throw not found error when there is no layer in catalog', async () => {
      const layerRequest = generateUpdateLayerRequest();

      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGdalInfo.mockImplementation(async () => Promise.resolve());
      sourceValidator.validateGpkgFiles.mockReturnValue(() => void 0);
      geoValidatorMock.validate.mockReturnValue(() => void 0);

      findByIdSpy.mockResolvedValue([]);

      const action = async () => {
        await ingestionManager.updateLayer(updatedLayer.metadata.id, layerRequest);
      };
      await expect(action()).rejects.toThrow(NotFoundError);
    });
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
