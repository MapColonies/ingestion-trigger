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

  describe('abortJob', () => {
    let jobId: string;

    beforeEach(() => {
      jobId = faker.string.uuid();
    });

    describe('Happy Path', () => {
      it('should successfully send abort request to Job Manager', async () => {
        nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).reply(200);

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).resolves.not.toThrow();
      });

      it('should call correct endpoint /tasks/abort/{jobId}', async () => {
        const scope = nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).reply(200);

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).resolves.not.toThrow();
        expect(scope.isDone()).toBe(true);
      });

      it('should send empty body in POST request', async () => {
        const scope = nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`, {}).reply(200);

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).resolves.not.toThrow();
        expect(scope.isDone()).toBe(true);
      });
    });

    describe('Error Scenarios', () => {
      it('should throw error when job not found', async () => {
        nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).reply(404, { message: 'Job not found' });

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).rejects.toThrow();
      });

      it('should throw error when Job Manager has internal server error', async () => {
        nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).reply(500, { message: 'Internal server error' });

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).rejects.toThrow();
      });

      it('should handle network timeout', async () => {
        nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).replyWithError({ code: 'ETIMEDOUT', message: 'Timeout' });

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).rejects.toThrow();
      });

      it('should handle connection refused', async () => {
        nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).replyWithError({ code: 'ECONNREFUSED', message: 'Connection refused' });

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).rejects.toThrow();
      });

      it('should propagate error and re-throw after logging', async () => {
        const errorMessage = 'Test error';
        nock('http://jobmanagerurl').post(`/tasks/abort/${jobId}`).replyWithError(new Error(errorMessage));

        const action = async () => jobManagerWrapper.abortJob(jobId);

        await expect(action()).rejects.toThrow(errorMessage);
      });
    });
  });
});
