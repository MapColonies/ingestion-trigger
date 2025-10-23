import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { trace } from '@opentelemetry/api';
import { CatalogClient } from '../../../src/serviceClients/catalogClient';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { HttpClient } from '@map-colonies/mc-utils';
import { faker } from '@faker-js/faker';
import { randexp } from 'randexp';
import { INGESTION_VALIDATIONS, RasterProductTypes } from '@map-colonies/raster-shared';

describe('CatalogClient', () => {
  let catalogClient: CatalogClient;
  let postSpy: jest.SpyInstance;
  const fakeProductId = faker.helpers.fromRegExp(randexp(INGESTION_VALIDATIONS.productId.pattern));
  const fakeProductType = faker.helpers.enumValue(RasterProductTypes);

  beforeEach(() => {
    registerDefaultConfig();

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
      const result = await catalogClient.exists(fakeProductId, fakeProductType);
      expect(result).toBe(true);
    });

    it('should return false when there isnt a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue([]);
      const result = await catalogClient.exists(fakeProductId, fakeProductType);
      expect(result).toBe(false);
    });
  });

  describe('findById', () => {
    it('should return true when there is a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue(['1']);
      const result = await catalogClient.exists(fakeProductId, fakeProductType);
      expect(result).toBe(true);
    });

    it('should return false when there isnt a record in the catalog with same id and type', async () => {
      postSpy.mockResolvedValue([]);
      const result = await catalogClient.exists(fakeProductId, fakeProductType);
      expect(result).toBe(false);
    });
  });
});
