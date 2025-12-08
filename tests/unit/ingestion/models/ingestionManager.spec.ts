import { faker } from '@faker-js/faker';
import { ConflictError, NotFoundError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { ICreateJobResponse, OperationStatus } from '@map-colonies/mc-priority-queue';
import { getMapServingLayerName } from '@map-colonies/raster-shared';
import { trace } from '@opentelemetry/api';
import { container } from 'tsyringe';
import xxhashFactory from 'xxhash-wasm';
import { SERVICES } from '../../../../src/common/constants';
import { InfoManager } from '../../../../src/info/models/infoManager';
import { ChecksumError, FileNotFoundError, UnsupportedEntityError } from '../../../../src/ingestion/errors/ingestionErrors';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { ProductManager } from '../../../../src/ingestion/models/productManager';
import { GeoValidator } from '../../../../src/ingestion/validators/geoValidator';
import { CatalogClient } from '../../../../src/serviceClients/catalogClient';
import { JobManagerWrapper } from '../../../../src/serviceClients/jobManagerWrapper';
import { MapProxyClient } from '../../../../src/serviceClients/mapProxyClient';
import { Checksum } from '../../../../src/utils/hash/checksum';
import { CHECKSUM_PROCESSOR } from '../../../../src/utils/hash/constants';
import type { ChecksumProcessor } from '../../../../src/utils/hash/interfaces';
import type { ValidateManager } from '../../../../src/validate/models/validateManager';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { generateCatalogLayerResponse, generateChecksum, generateNewLayerRequest, generateUpdateLayerRequest } from '../../../mocks/mockFactory';

describe('IngestionManager', () => {
  let ingestionManager: IngestionManager;

  const mockValidateManager = {
    validateGpkgsSources: jest.fn(),
    validateShapefiles: jest.fn(),
  } satisfies Partial<ValidateManager>;

  const productManager = { read: jest.fn() } satisfies Partial<ProductManager>;

  const mockInfoManager = {
    getGpkgsInformation: jest.fn(),
  } satisfies Partial<InfoManager>;

  const mockGeoValidator = {
    validate: jest.fn(),
  };

  let createIngestionJobSpy: jest.SpyInstance;
  let findJobsSpy: jest.SpyInstance;
  let existsMapproxySpy: jest.SpyInstance;
  let existsCatalogSpy: jest.SpyInstance;
  let calcualteChecksumSpy: jest.SpyInstance;
  let findByIdSpy: jest.SpyInstance;

  let catalogClient: CatalogClient;
  let mapProxyClient: MapProxyClient;
  let jobManagerWrapper: JobManagerWrapper;

  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    registerDefaultConfig();
    // Reset container for a clean test
    container.reset();
    container.register(SERVICES.TRACER, { useValue: testTracer });
    container.register(SERVICES.LOGGER, { useValue: testLogger });
    container.register(CHECKSUM_PROCESSOR, {
      useFactory: (): (() => Promise<ChecksumProcessor>) => {
        return async () => {
          const xxhash = await xxhashFactory();
          return { ...xxhash.create64(), algorithm: 'XXH64' };
        };
      },
    });

    mapProxyClient = new MapProxyClient(configMock, testLogger, testTracer);
    catalogClient = new CatalogClient(configMock, testLogger, testTracer);
    jobManagerWrapper = new JobManagerWrapper(configMock, testLogger, testTracer);
    createIngestionJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'createIngestionJob');
    findJobsSpy = jest.spyOn(JobManagerWrapper.prototype, 'findJobs');
    existsMapproxySpy = jest.spyOn(MapProxyClient.prototype, 'exists');
    existsCatalogSpy = jest.spyOn(CatalogClient.prototype, 'exists');
    findByIdSpy = jest.spyOn(CatalogClient.prototype, 'findById');
    calcualteChecksumSpy = jest.spyOn(Checksum.prototype, 'calculate');

    ingestionManager = new IngestionManager(
      testLogger,
      configMock,
      testTracer,
      mockValidateManager as unknown as ValidateManager,
      mockInfoManager as unknown as InfoManager,
      mockGeoValidator as unknown as GeoValidator,
      catalogClient,
      jobManagerWrapper,
      mapProxyClient,
      productManager as unknown as ProductManager
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
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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

    it('should not throw any errors when the request is valid and create ingestion new job and that internalID is set', async () => {
      const layerRequest = generateNewLayerRequest();
      const createJobResponse: ICreateJobResponse = { id: faker.string.uuid(), taskIds: [faker.string.uuid()] };
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([]);
      calcualteChecksumSpy.mockResolvedValue(generateChecksum());
      createIngestionJobSpy.mockResolvedValue(createJobResponse);
      const expectedResponse = { jobId: createJobResponse.id, taskId: createJobResponse.taskIds[0] };

      const response = await ingestionManager.newLayer(layerRequest);

      expect(response).toStrictEqual(expectedResponse);
      expect(createIngestionJobSpy).toHaveBeenCalledTimes(1);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const actualInternalId = createIngestionJobSpy.mock.calls[0][0].internalId; //[0][0] - first call, first argument
      expect(actualInternalId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(createIngestionJobSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ingestionNewJobType,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          internalId: actualInternalId,
        })
      );
    });

    it('should throw unsupported entity error when shapefile not found error', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = 'error message';
      mockValidateManager.validateShapefiles.mockRejectedValue(new FileNotFoundError(expectedErrorMessage));

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new UnsupportedEntityError(`File ${expectedErrorMessage} does not exist`));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw unsupported entity error when gpkg files validation throws an error', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = 'errror message';
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockRejectedValue(new Error(expectedErrorMessage));

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new UnsupportedEntityError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when fails to read gpkg info', async () => {
      const layerRequest = generateNewLayerRequest();
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow();
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when fails to read product shapefile', async () => {
      const layerRequest = generateNewLayerRequest();
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow();
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when fails to validate product geometry against gpkg info', async () => {
      const layerRequest = generateNewLayerRequest();
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockImplementation(() => {
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(true);

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when MapProxy call throws an unhandled error', async () => {
      const layerRequest = generateNewLayerRequest();
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(Error);
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when the layer is in catalog', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = `ProductId: ${layerRequest.metadata.productId} ProductType: ${layerRequest.metadata.productType}, already exists in catalog`;
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(true);

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when catalog call throws an unhandled error', async () => {
      const layerRequest = generateNewLayerRequest();
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockRejectedValue(new Error());

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(Error);
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw conflict error when there is a job running', async () => {
      const layerRequest = generateNewLayerRequest();
      const expectedErrorMessage = `ProductId: ${layerRequest.metadata.productId} productType: ${layerRequest.metadata.productType}, there is at least one conflicting job already running for that layer`;
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(false);
      existsCatalogSpy.mockResolvedValue(false);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);

      const promise = ingestionManager.newLayer(layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });

    it('should throw an error when job manager call throws an unhandled error', async () => {
      const layerRequest = generateNewLayerRequest();
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
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
      mockValidateManager.validateShapefiles.mockResolvedValue(undefined);
      mockValidateManager.validateGpkgsSources.mockResolvedValue(undefined);
      mockInfoManager.getGpkgsInformation.mockResolvedValue(undefined);
      productManager.read.mockResolvedValue(undefined);
      mockGeoValidator.validate.mockResolvedValue(undefined);
      existsMapproxySpy.mockResolvedValue(true);
      findJobsSpy.mockResolvedValue([{ status: OperationStatus.IN_PROGRESS }]);

      const promise = ingestionManager.updateLayer(catalogLayerResponse.metadata.id, layerRequest);

      await expect(promise).rejects.toThrow(new ConflictError(expectedErrorMessage));
      expect(createIngestionJobSpy).not.toHaveBeenCalled();
    });
  });
});
