import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { NewRasterLayerMetadata, NewRasterLayer, UpdateRasterLayer } from '@map-colonies/mc-model-types';
import { ICreateJobBody, ICreateJobResponse, IJobResponse, OperationStatus, ITaskResponse, JobManagerClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SERVICES } from '../common/constants';
import { IConfig } from '../common/interfaces';
import { ITaskParameters } from '../ingestion/interfaces';
import { JobAction, TaskAction } from '../common/enums';
import { LogContext } from '../utils/logger/logContext';

@injectable()
export class JobManagerWrapper extends JobManagerClient {
  private readonly jobDomain: string;
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    super(
      logger,
      config.get<string>('jobManagerURL'),
      config.get<IHttpRetryConfig>('httpRetry'),
      'jobManagerClient',
      config.get<boolean>('disableHttpClientLogs')
    );
    this.jobDomain = config.get<string>('jobDomain');
    this.logContext = {
      fileName: __filename,
      class: JobManagerWrapper.name,
    };
  }

  @withSpanAsyncV4
  public async createInitJob(data: NewRasterLayer): Promise<ICreateJobResponse> {
    const jobId: string = '';
    const taskParams: ITaskParameters[] = [{ rasterIngestionLayer: data, blockDuplication: true }];
    try {
      const jobResponse = await this.createNewJob(data, JobAction.NEW, TaskAction.INIT, taskParams);
      //await this.createTask(jobId, taskParams, TaskAction.INIT);
      return jobResponse;
    } catch (err) {
      await this.updateJobById(jobId, OperationStatus.FAILED);
      throw err;
    }
  }

  @withSpanAsyncV4
  private async createNewJob(data: NewRasterLayer, jobType: string, taskType: string, taskParams?: ITaskParameters[]): Promise<ICreateJobResponse> {
    const createLayerTasksUrl = `/jobs`;
    let createJobRequest: CreateJobBody = {
      resourceId: '',
      version: '',
      parameters: {},
      type: '',
    };
    const resourceId = data.metadata.productId;
    createJobRequest = {
      resourceId: resourceId,
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

  @withSpanAsyncV4
  private async createTask(jobId: string, taskParams: ITaskParameters[], taskType: string): Promise<void> {
    const createTasksUrl = `/jobs/${jobId}/tasks`;
    const parmas = taskParams;
    const req = parmas.map((params) => {
      return {
        type: taskType,
        parameters: params,
      };
    });
    await this.post(createTasksUrl, req);
  }

  @withSpanAsyncV4
  private async updateJobById(jobId: string, status: OperationStatus, jobPercentage?: number, reason?: string, catalogId?: string): Promise<void> {
    const updateJobBody = {
      status: status,
      reason: reason,
      internalId: catalogId,
      percentage: jobPercentage,
    };
    await this.updateJob(jobId, updateJobBody);
  }
}

export type JobResponse = IJobResponse<Record<string, unknown>, ITaskParameters>;
export type TaskResponse = ITaskResponse<ITaskParameters>;
export type CreateJobBody = ICreateJobBody<Record<string, unknown>, ITaskParameters>;
