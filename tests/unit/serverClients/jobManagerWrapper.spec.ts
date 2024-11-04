import jsLogger from '@map-colonies/js-logger';
import nock from 'nock';
import { trace } from '@opentelemetry/api';
import { JobManagerWrapper } from '../../../src/serviceClients/jobManagerWrapper';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { newLayerRequest, jobResponse, newJobRequest } from '../../mocks/newIngestionRequestMockData';
import { updateJobRequest, updateLayerRequest, updatedLayer } from '../../mocks/updateRequestMockData';
import { LayerDetails } from '../../../src/common/interfaces';

describe('jobManagerWrapper', () => {
  let jobManagerWrapper: JobManagerWrapper;
  let jobManagerURL = '';
  const updateJobType = 'Ingestion_Update';

  beforeEach(() => {
    registerDefaultConfig();
    jobManagerURL = configMock.get<string>('services.jobManagerURL');

    jobManagerWrapper = new JobManagerWrapper(configMock, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
  });
  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
  });

  describe('check CreateInitJob function', () => {
    it('should return jobResponse when init creation is successful', async () => {
      nock(jobManagerURL).post('/jobs', newJobRequest).reply(200, jobResponse);
      const action = async () => jobManagerWrapper.createInitJob(newLayerRequest.valid);
      await expect(action()).resolves.toEqual(jobResponse);
    });

    it('should throw error when init creation wasnt successful', async () => {
      nock(jobManagerURL).post('/jobs', newJobRequest).reply(504);
      const action = async () => jobManagerWrapper.createInitJob(newLayerRequest.valid);
      await expect(action()).rejects.toThrow();
    });
  });

  describe('check CreateInitUpdateJob function', () => {
    it('should return jobResponse when init update creation is successful', async () => {
      const layerRequest = updateLayerRequest.valid;
      const { productId, productVersion, tileOutputFormat, displayPath, productType, id, footprint, productName, productSubType } =
        updatedLayer.metadata;
      const layerDetails: LayerDetails = {
        productId,
        productVersion,
        tileOutputFormat,
        displayPath,
        productType,
        productName,
        productSubType,
        footprint,
      };
      nock(jobManagerURL).post('/jobs', updateJobRequest).reply(200, jobResponse);
      const action = async () => jobManagerWrapper.createInitUpdateJob(layerDetails, id, layerRequest, updateJobType);
      await expect(action()).resolves.toEqual(jobResponse);
    });

    it('should throw error when init update creation wasnt successful', async () => {
      const layerRequest = updateLayerRequest.valid;
      const { productId, productVersion, tileOutputFormat, displayPath, productType, id, footprint, productName, productSubType } =
        updatedLayer.metadata;
      const layerDetails: LayerDetails = {
        productId,
        productVersion,
        tileOutputFormat,
        displayPath,
        productType,
        productName,
        productSubType,
        footprint,
      };
      nock(jobManagerURL).post('/jobs', updateJobRequest).reply(504);

      const action = async () => jobManagerWrapper.createInitUpdateJob(layerDetails, id, layerRequest, updateJobType);
      await expect(action()).rejects.toThrow();
    });
  });
});
