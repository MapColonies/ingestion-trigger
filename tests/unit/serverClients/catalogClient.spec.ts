import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { trace } from '@opentelemetry/api';
import { CatalogClient } from '../../../src/serviceClients/catalogClient';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { validNewLayerRequest } from '../../mocks/newIngestionRequestMockData';
import { HttpClient } from '@map-colonies/mc-utils';

describe('CatalogClient', () => {
  let catalogClient: CatalogClient;
  let catalogServiceURL = '';
  let catalogPostIdAndType = {};
  let postSpy: jest.SpyInstance;

  beforeEach(() => {
    registerDefaultConfig();
    catalogServiceURL = configMock.get<string>('services.catalogServiceURL');
    catalogPostIdAndType = {
      metadata: { productId: validNewLayerRequest.valid.metadata.productId, productType: validNewLayerRequest.valid.metadata.productType },
    };

    catalogClient = new CatalogClient(configMock as unknown as IConfig, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
    postSpy = jest.spyOn(HttpClient.prototype as unknown as { post: jest.Mock }, 'post');
  });
  afterEach(() => {
    clearConfig();
    jest.resetAllMocks();
  });

  describe('exists', () => {
    it('should return true when there is a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue(['1']);
      const result = await catalogClient.exists(validNewLayerRequest.valid.metadata.productId, validNewLayerRequest.valid.metadata.productType);
      expect(result).toBe(true);
    });

    it('should return false when there isnt a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue([]);
      const result = await catalogClient.exists(validNewLayerRequest.valid.metadata.productId, validNewLayerRequest.valid.metadata.productType);
      expect(result).toBe(false);
    });
  });
  describe('findById', () => {
    it('should return true when there is a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue(['1']);
      const result = await catalogClient.exists(validNewLayerRequest.valid.metadata.productId, validNewLayerRequest.valid.metadata.productType);
      expect(result).toBe(true);
    });

    it('should return false when there isnt a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue([]);
      const result = await catalogClient.exists(validNewLayerRequest.valid.metadata.productId, validNewLayerRequest.valid.metadata.productType);
      expect(result).toBe(false);
    });
  });
});
