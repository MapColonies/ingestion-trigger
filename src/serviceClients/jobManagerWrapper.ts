import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { IngestionParams } from '@map-colonies/mc-model-types';
import { ICreateJobBody, ICreateJobResponse, IJobResponse, OperationStatus, ITaskResponse, JobManagerClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SERVICES } from '../common/constants';
import { IConfig } from '../common/interfaces';
import { ITaskParameters } from '../ingestion/interfaces';

@injectable()
export class JobManagerWrapper extends JobManagerClient {
  private readonly jobDomain: string;

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
  }

  @withSpanAsyncV4
  public async createLayerJob(
    data: IngestionParams,
    layerRelativePath: string,
    jobType: string,
    taskType: string,
    taskParams?: ITaskParameters[],
    managerCallbackUrl?: string
  ): Promise<string> {
    const resourceId = data.metadata.productId as string;
    const createLayerTasksUrl = `/jobs`;
    const createJobRequest: CreateJobBody = {
      resourceId: resourceId,
      internalId: data.metadata.id as string,
      type: jobType,
      status: OperationStatus.IN_PROGRESS,
      parameters: { ...data, layerRelativePath, managerCallbackUrl } as unknown as Record<string, unknown>,
      producerName: data.metadata.producerName,
      productName: data.metadata.productName,
      productType: data.metadata.productType,
      domain: this.jobDomain,
      tasks: taskParams?.map((params) => {
        return {
          type: taskType,
          parameters: params,
        };
      }),
      version: '',
    };
    const res = await this.post<ICreateJobResponse>(createLayerTasksUrl, createJobRequest);
    return res.id;
  }

  @withSpanAsyncV4
  public async createTasks(jobId: string, taskParams: ITaskParameters[], taskType: string): Promise<void> {
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
}

export type JobResponse = IJobResponse<Record<string, unknown>, ITaskParameters>;
export type TaskResponse = ITaskResponse<ITaskParameters>;
export type CreateJobBody = ICreateJobBody<Record<string, unknown>, ITaskParameters>;
