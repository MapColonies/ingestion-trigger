import jsLogger from '@map-colonies/js-logger';
import { getMapServingLayerName, INGESTION_VALIDATIONS, RasterProductTypes } from '@map-colonies/raster-shared';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { MapProxyClient } from '../../../src/serviceClients/mapProxyClient';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../mocks/configMock';
//import { newLayerRequest } from '../../mocks/newIngestionRequestMockData';
import { faker } from '@faker-js/faker';
import { randexp } from 'randexp';
import { HttpClient } from '@map-colonies/mc-utils';
import { InternalServerError, NotFoundError } from '@map-colonies/error-types';

describe('mapProxyClient', () => {
  let mapProxyClient: MapProxyClient;
  let mapProxyApiServiceUrl = '';
  let getSpy: jest.SpyInstance;
  
  const fakeProductId = faker.helpers.fromRegExp(randexp(INGESTION_VALIDATIONS.productId.pattern));
  const fakeProductType = faker.helpers.enumValue(RasterProductTypes);
  const layerName = getMapServingLayerName(fakeProductId, fakeProductType);

  beforeEach(() => {
    registerDefaultConfig();
    mapProxyApiServiceUrl = configMock.get<string>('services.mapProxyApiServiceUrl');

    mapProxyClient = new MapProxyClient(configMock, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
    getSpy = jest.spyOn(HttpClient.prototype as unknown as { get: jest.Mock }, 'get');
  });

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
    jest.restoreAllMocks()
  });

  describe('exists', () => {
    it('should return false when layer is not in mapProxy', async () => {
      getSpy.mockRejectedValue(new NotFoundError(''));
      const result = await mapProxyClient.exists(layerName);
      expect(result).toBe(false);
    });

    it('should return true when layer is not in mapProxy', async () => {
      getSpy.mockResolvedValue([]);
      const result = await mapProxyClient.exists(layerName);
      expect(result).toBe(true);
    });

    it('should throw error when there is an unexpected error from mapProxy', async () => {
      getSpy.mockRejectedValue(InternalServerError);
      const action = async () => mapProxyClient.exists(layerName);
      await expect(action()).rejects.toThrow();
    });
  });
});
