import jsLogger from '@map-colonies/js-logger';
import nock from 'nock';
import { JobManagerWrapper } from '../../../src/serviceClients/jobManagerWrapper';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { newLayerRequest, jobResponse, newJobRequest } from '../../mocks/newIngestionRequestMockData';

describe('jobManagerWrapper', () => {
  let jobManagerWrapper: JobManagerWrapper;
  let jobManagerURL = '';

  beforeEach(() => {
    registerDefaultConfig();
    jobManagerURL = configMock.get<string>('jobManagerURL');

    jobManagerWrapper = new JobManagerWrapper(configMock, jsLogger({ enabled: false }));
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
});
