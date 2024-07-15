import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { NewRasterLayer, UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { ICreateJobBody, ICreateJobResponse, IJobResponse, OperationStatus, ITaskResponse, JobManagerClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { SERVICES } from '../common/constants';
import { IConfig } from '../common/interfaces';
import { ITaskParameters } from '../ingestion/interfaces';
import { LogContext } from '../utils/logger/logContext';
import { UpdateJobAction } from '../common/enums';

@injectable()
export class JobManagerWrapper extends JobManagerClient {
  private readonly jobDomain: string;
  private readonly logContext: LogContext;
  private readonly ingestionNewJobType: string;
  private readonly initTaskType: string;
  private readonly ingestionUpdateJobType: string;
  private readonly ingestionSwapUpdateJobType: string;

  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    super(
      logger,
      config.get<string>('services.jobManagerURL'),
      config.get<IHttpRetryConfig>('httpRetry'),
      'jobManagerClient',
      config.get<boolean>('disableHttpClientLogs')
    );
    this.jobDomain = config.get<string>('jobManager.jobDomain');
    this.ingestionNewJobType = config.get<string>('jobManager.ingestionNewJobType');
    this.initTaskType = config.get<string>('jobManager.initTaskType');
    this.ingestionUpdateJobType = config.get<string>('jobManager.ingestionUpdateJobType');
    this.ingestionSwapUpdateJobType = config.get<string>('jobManager.ingestionSwapUpdateJobType');
    this.logContext = {
      fileName: __filename,
      class: JobManagerWrapper.name,
    };
  }

  public async createInitJob(data: NewRasterLayer): Promise<ICreateJobResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.createInitJob.name };
    const taskParams: ITaskParameters[] = [{ blockDuplication: true }];
    try {
      const jobResponse = await this.createNewJob(data, this.ingestionNewJobType, this.initTaskType, taskParams);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new init job ';
      this.logger.error({ msg: message, err, logContext: logCtx, layer: data });
      throw err;
    }
  }

  public async createInitUpdateJob(
    id: string,
    version: string,
    internalId: string,
    data: UpdateRasterLayer,
    updateJobAction: UpdateJobAction
  ): Promise<ICreateJobResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.createInitUpdateJob.name };
    const taskParams: ITaskParameters[] = [{ blockDuplication: true }];
    const jobType = updateJobAction === UpdateJobAction.UPDATE ? this.ingestionUpdateJobType : this.ingestionSwapUpdateJobType;
    try {
      const jobResponse = await this.createUpdateJob(id, version, internalId, data, jobType, this.initTaskType, taskParams);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new init update job ';
      this.logger.error({ msg: message, jobType: jobType, taskType: this.initTaskType, err, logContext: logCtx, layer: data });
      throw err;
    }
  }

  private async createNewJob(data: NewRasterLayer, jobType: string, taskType: string, taskParams?: ITaskParameters[]): Promise<ICreateJobResponse> {
    const createLayerTasksUrl = `/jobs`;
    const createJobRequest: CreateJobBody = {
      resourceId: data.metadata.productId,
      version: '1.0',
      type: jobType,
      status: OperationStatus.PENDING,
      parameters: { ...data } as unknown as Record<string, unknown>,
      productName: data.metadata.productName,
      productType: data.metadata.productType,
      domain: this.jobDomain,
      tasks: taskParams?.map((params) => {
        return {
          type: taskType,
          parameters: params,
        };
      }),
    };
    const res = await this.post<ICreateJobResponse>(createLayerTasksUrl, createJobRequest);
    return res;
  }

  private async createUpdateJob(
    id: string,
    version: string,
    internalId: string,
    data: UpdateRasterLayer,
    jobType: string,
    taskType: string,
    taskParams?: ITaskParameters[]
  ): Promise<ICreateJobResponse> {
    const createLayerTasksUrl = `/jobs`;
    const createJobRequest: CreateJobBody = {
      resourceId: id,
      version: version,
      internalId: internalId,
      type: jobType,
      status: OperationStatus.PENDING,
      parameters: { ...data } as unknown as Record<string, unknown>,
      domain: this.jobDomain,
      tasks: taskParams?.map((params) => {
        return {
          type: taskType,
          parameters: params,
        };
      }),
    };
    const res = await this.post<ICreateJobResponse>(createLayerTasksUrl, createJobRequest);
    return res;
  }
}

export type JobResponse = IJobResponse<Record<string, unknown>, ITaskParameters>;
export type TaskResponse = ITaskResponse<ITaskParameters>;
export type CreateJobBody = ICreateJobBody<Record<string, unknown>, ITaskParameters>;
