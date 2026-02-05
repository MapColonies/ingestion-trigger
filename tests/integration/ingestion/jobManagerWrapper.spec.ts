import { faker } from '@faker-js/faker';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { JobManagerWrapper } from '../../../src/serviceClients/jobManagerWrapper';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../mocks/configMock';

describe('jobManagerWrapper integration', () => {
  let jobManagerWrapper: JobManagerWrapper;

  beforeEach(() => {
    registerDefaultConfig();
    jobManagerWrapper = new JobManagerWrapper(configMock, jsLogger({ enabled: false }), trace.getTracer('testTracer'));
  });

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.clearAllMocks();
    jest.restoreAllMocks();
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
    });

    describe('Sad Path', () => {
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
    });
  });
});
