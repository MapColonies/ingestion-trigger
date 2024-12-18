import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import nock from 'nock';
import { trace } from '@opentelemetry/api';
import { CatalogClient } from '../../../src/serviceClients/catalogClient';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { newLayerRequest } from '../../mocks/newIngestionRequestMockData';

describe('CatalogClient', () => {
  let catalogClient: CatalogClient;
  let catalogServiceURL = '';
  let catalogPostIdAndType = {};

  beforeEach(() => {
    registerDefaultConfig();
    catalogServiceURL = configMock.get<string>('services.catalogServiceURL');
    catalogPostIdAndType = {
      metadata: { productId: newLayerRequest.valid.metadata.productId, productType: newLayerRequest.valid.metadata.productType },
    };

    catalogClient = new CatalogClient(configMock as unknown as IConfig, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
  });
  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });

  describe('check exists function', () => {
    it('should return true when there is a record in the catalog with same id and type', async () => {
      nock(catalogServiceURL).post('/records/find', catalogPostIdAndType).reply(200, ['1']);
      const result = await catalogClient.exists(newLayerRequest.valid.metadata.productId, newLayerRequest.valid.metadata.productType);
      expect(result).toBe(true);
    });

    it('should return false when there isnt a record in the catalog with same id and type', async () => {
      nock(catalogServiceURL).post('/records/find', catalogPostIdAndType).reply(200, []);
      const result = await catalogClient.exists(newLayerRequest.valid.metadata.productId, newLayerRequest.valid.metadata.productType);
      expect(result).toBe(false);
    });
  });
});
