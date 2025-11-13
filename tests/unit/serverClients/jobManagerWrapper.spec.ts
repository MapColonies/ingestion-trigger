import { faker } from '@faker-js/faker';
import { InternalServerError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import type { ICreateJobResponse } from '@map-colonies/mc-priority-queue';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { JobManagerWrapper } from '../../../src/serviceClients/jobManagerWrapper';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../mocks/configMock';
import { generateNewJobRequest, generateUpdateJobRequest } from '../../mocks/mockFactory';

describe('jobManagerWrapper', () => {
  let jobManagerWrapper: JobManagerWrapper;
  let createJobSpy: jest.SpyInstance;
  let jobResponse: ICreateJobResponse;

  beforeEach(() => {
    registerDefaultConfig();
    jobManagerWrapper = new JobManagerWrapper(configMock, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
    createJobSpy = jest.spyOn(JobManagerWrapper.prototype, 'createJob');
    jobResponse = {
      id: faker.string.uuid(),
      taskIds: [faker.string.uuid()],
    };
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
      const newJobRequest = generateNewJobRequest();

      const action = async () => jobManagerWrapper.createIngestionJob(newJobRequest);
      await expect(action()).resolves.toEqual(jobResponse);
    });

    it('should throw an error if job manager client throws unexpected error while trying to create new job', async () => {
      const newJobRequest = generateNewJobRequest();
      createJobSpy.mockRejectedValue(InternalServerError);

      const action = async () => jobManagerWrapper.createIngestionJob(newJobRequest);
      await expect(action()).rejects.toThrow();
    });

    it('should return jobResponse when update job with validation task creation is successful', async () => {
      const updateJobRequest = generateUpdateJobRequest();
      createJobSpy.mockResolvedValue(jobResponse);

      const action = async () => jobManagerWrapper.createIngestionJob(updateJobRequest);
      await expect(action()).resolves.toEqual(jobResponse);
    });

    it('should throw an error if job manager client throws unexpected error while trying to create update job', async () => {
      const updateJobRequest = generateUpdateJobRequest();
      createJobSpy.mockRejectedValue(InternalServerError);

      const action = async () => jobManagerWrapper.createIngestionJob(updateJobRequest);
      await expect(action()).rejects.toThrow();
    });
  });
});
