import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import nock from 'nock';
import { HttpClient } from '@map-colonies/mc-utils';
import { InternalServerError } from '@map-colonies/error-types';
import { ITaskResponse } from '@map-colonies/mc-priority-queue';
import { clear as clearConfig, configMock, registerDefaultConfig } from '../../mocks/configMock';
import { JobTrackerClient } from '../../../src/serviceClients/jobTrackerClient';

describe('JobTrackerClient', () => {
  let jobTrackerClient: JobTrackerClient;
  let postSpy: jest.SpyInstance;

  beforeEach(async () => {
    registerDefaultConfig();

    jobTrackerClient = new JobTrackerClient(configMock, await jsLogger({ enabled: false }), trace.getTracer('testTracer'));
    postSpy = jest.spyOn(HttpClient.prototype as unknown as { post: jest.Mock }, 'post');
  });

  afterEach(() => {
    nock.cleanAll();
    clearConfig();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  });

  describe('notify', () => {
    it('should call post with the correct url', async () => {
      const task = { id: 'taskId1', status: 'In-Progress', type: 'type1' } as unknown as ITaskResponse<unknown>;
      postSpy.mockResolvedValue({});

      await jobTrackerClient.notify(task);

      expect(postSpy).toHaveBeenCalledWith('tasks/taskId1/notify');
    });

    it('should throw an error when post throws an error', async () => {
      const task = { id: 'taskId1', status: 'In-Progress', type: 'type1' } as unknown as ITaskResponse<unknown>;
      postSpy.mockRejectedValue(new InternalServerError('Internal Server Error'));

      const action = async () => jobTrackerClient.notify(task);

      await expect(action()).rejects.toThrow('Failed to notify job tracker: Internal Server Error');
    });
  });
});
