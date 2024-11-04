import { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { NewRasterLayer, UpdateRasterLayer, IngestionUpdateJobParams, IngestionNewJobParams } from '@map-colonies/mc-model-types';
import { ICreateJobBody, ICreateJobResponse, IJobResponse, OperationStatus, ITaskResponse, JobManagerClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { trace, Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SERVICES } from '../common/constants';
import { IConfig, LayerDetails } from '../common/interfaces';
import { ITaskParameters } from '../ingestion/interfaces';

@injectable()
export class JobManagerWrapper extends JobManagerClient {
  private readonly jobDomain: string;
  private readonly ingestionNewJobType: string;
  private readonly updateJobType: string;
  private readonly initTaskType: string;
  private readonly jobTrackerServiceUrl: string;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
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
    this.updateJobType = config.get<string>('jobManager.ingestionUpdateJobType');
    this.jobTrackerServiceUrl = config.get<string>('services.jobTrackerServiceURL');
  }

  @withSpanAsyncV4
  public async createInitJob(data: NewRasterLayer): Promise<ICreateJobResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('jobManagerWrapper.createInitJob');
    const taskParams: ITaskParameters[] = [{ blockDuplication: true }];
    try {
      const jobResponse = await this.createNewJob(data, this.ingestionNewJobType, this.initTaskType, taskParams);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new init job ';
      this.logger.error({ msg: message, err, layer: data });
      throw err;
    }
  }

  @withSpanAsyncV4
  public async createInitUpdateJob(
    layerDetails: LayerDetails,
    catalogId: string,
    data: UpdateRasterLayer,
    jobType: string
  ): Promise<ICreateJobResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('jobManagerWrapper.createInitUpdateJob');
    const taskParams: ITaskParameters[] = [{ blockDuplication: true }];

    try {
      const jobResponse = await this.createUpdateJob(layerDetails, catalogId, data, jobType, this.initTaskType, taskParams);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new init update job ';
      this.logger.error({ msg: message, jobType: jobType, taskType: this.initTaskType, err, layer: data });
      throw err;
    }
  }

  @withSpanAsyncV4
  private async createNewJob(data: NewRasterLayer, jobType: string, taskType: string, taskParams?: ITaskParameters[]): Promise<ICreateJobResponse> {
    const createLayerTasksUrl = `/jobs`;
    const ingestionNewJobParams: IngestionNewJobParams = {
      ...data,
      additionalParams: { jobTrackerServiceURL: this.jobTrackerServiceUrl },
    };
    const createJobRequest: CreateJobBody = {
      resourceId: data.metadata.productId,
      version: '1.0',
      type: jobType,
      status: OperationStatus.PENDING,
      parameters: ingestionNewJobParams,
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
  private async createUpdateJob(
    layerDetails: LayerDetails,
    catalogId: string,
    data: UpdateRasterLayer,
    jobType: string,
    taskType: string,
    taskParams?: ITaskParameters[]
  ): Promise<ICreateJobResponse> {
    const createLayerTasksUrl = `/jobs`;
    const { productId, productName, productType, productVersion: version, tileOutputFormat, displayPath, footprint } = layerDetails;
    const ingestionUpdateJobParams: IngestionUpdateJobParams = {
      ...data,
      additionalParams: {
        footprint,
        tileOutputFormat,
        jobTrackerServiceURL: this.jobTrackerServiceUrl,
        ...(jobType === this.updateJobType && { displayPath }),
      },
    };
    const createJobRequest: CreateJobBody = {
      resourceId: productId,
      version: (parseFloat(version) + 1).toFixed(1),
      internalId: catalogId,
      type: jobType,
      productName: productName,
      productType: productType,
      status: OperationStatus.PENDING,
      parameters: ingestionUpdateJobParams,
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
export type CreateJobBody = ICreateJobBody<IngestionNewJobParams | IngestionUpdateJobParams, ITaskParameters>;
