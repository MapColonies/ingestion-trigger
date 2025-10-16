import jsLogger from '@map-colonies/js-logger';
import nock from 'nock';
import { trace } from '@opentelemetry/api';
import { JobManagerWrapper } from '../../../src/serviceClients/jobManagerWrapper';
import { configMock, registerDefaultConfig, clear as clearConfig } from '../../mocks/configMock';
import { jobResponse, ingestionNewJobRequest, ingestionUpdateJobRequest } from '../../mocks/newIngestionRequestMockData';
import { InternalServerError } from '@map-colonies/error-types';

describe('jobManagerWrapper', () => {
  let jobManagerWrapper: JobManagerWrapper;
  let jobManagerURL = '';
  let createJobSpy: jest.SpyInstance;

  beforeEach(() => {
    registerDefaultConfig();
    jobManagerURL = configMock.get<string>('services.jobManagerURL');
    jobManagerWrapper = new JobManagerWrapper(configMock, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
    createJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'createJob');
  });
  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createIngestionJob', () => {
    it('should return jobResponse when new job with validation task creation is successful', async () => {
      createJobSpy.mockResolvedValue(jobResponse);
      const action = async () => jobManagerWrapper.createIngestionJob(ingestionNewJobRequest);
      await expect(action()).resolves.toEqual(jobResponse);
    });

    it('should throw error when new job with validation task wasnt successful', async () => {
      createJobSpy.mockRejectedValue(InternalServerError);
      const action = async () => jobManagerWrapper.createIngestionJob(ingestionNewJobRequest);
      await expect(action()).rejects.toThrow();
    });

    it('should return jobResponse when update job with validation task creation is successful', async () => {
      createJobSpy.mockResolvedValue(jobResponse);
      const action = async () => jobManagerWrapper.createIngestionJob(ingestionUpdateJobRequest);
      await expect(action()).resolves.toEqual(jobResponse);
    });

    it('should throw error when update job with validation task creation wasnt successful', async () => {
      createJobSpy.mockRejectedValue(InternalServerError);
      const action = async () => jobManagerWrapper.createIngestionJob(ingestionUpdateJobRequest);
      await expect(action()).rejects.toThrow();
    });
  });
});
