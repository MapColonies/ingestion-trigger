import jsLogger from '@map-colonies/js-logger';
import nock from 'nock';
import { MapProxyClient } from '../../../src/serviceClients/mapProxyClient';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { newLayerRequest } from '../../mocks/newLayerRequestMock';
import { getMapServingLayerName } from '../../../src/utils/layerNameGenerator';

describe('mapProxyClient', () => {
  let mapProxyClient: MapProxyClient;
  let mapProxyApiServiceUrl = '';
  let layerName = '';

  beforeEach(() => {
    registerDefaultConfig();
    mapProxyApiServiceUrl = configMock.get<string>('mapProxyApiServiceUrl');
    layerName = getMapServingLayerName(newLayerRequest.valid.metadata.productId, newLayerRequest.valid.metadata.productType);

    mapProxyClient = new MapProxyClient(configMock, jsLogger({ enabled: false }));
  });
  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });

  describe('check exists function', () => {
    it('should return false when layer is not in mapProxy', async () => {
      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(404);
      const result = await mapProxyClient.exists(layerName);
      expect(result).toBe(false);
    });

    it('should return true when layer is not in mapProxy', async () => {
      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(200, []);
      const result = await mapProxyClient.exists(layerName);
      expect(result).toBe(true);
    });

    it('should throw error when there is an unexpected error from mapProxy', async () => {
      nock(mapProxyApiServiceUrl)
        .get(`/layer/${encodeURIComponent(layerName)}`)
        .reply(504);
      const action = async () => mapProxyClient.exists(layerName);
      await expect(action()).rejects.toThrow();
    });
  });
});
