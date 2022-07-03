import config, { IConfig } from 'config';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IngestionParams, ProductType } from '@map-colonies/mc-model-types';
import { SERVICES } from '../common/constants';
import { OperationStatus } from '../common/enums';
import { ICompletedTasks } from '../tasks/interfaces';
import { ITaskParameters } from '../layers/interfaces';
import { HttpClient, IHttpRetryConfig, parseConfig } from './clientsBase/httpClient';

interface ICreateTaskBody {
  description?: string;
  parameters: IngestionParams;
  reason?: string;
  type?: string;
  status?: OperationStatus;
  attempts?: number;
}

interface ICreateJobBody {
  resourceId: string;
  version: string;
  parameters: Record<string, unknown>;
  type: string;
  description?: string;
  status?: OperationStatus;
  reason?: string;
  tasks?: ICreateTaskBody[];
  internalId?: string;
  producerName?: string;
  productName?: string;
  productType?: string;
}

interface ICreateJobResponse {
  id: string;
  taskIds: string[];
}

interface IGetTaskResponse {
  id: string;
  jobId: string;
  description?: string;
  parameters?: Record<string, unknown>;
  created: Date;
  updated: Date;
  status: OperationStatus;
  percentage?: number;
  reason?: string;
  attempts: number;
}

interface IGetJobResponse {
  id: string;
  resourceId?: string;
  version?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  reason?: string;
  tasks?: IGetTaskResponse[];
  created: Date;
  updated: Date;
  status?: OperationStatus;
  percentage?: number;
  isCleaned: boolean;
  internalId?: string;
  producerName?: string;
  productName?: string;
  productType?: string;
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  expiredTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
}

const jobType = config.get<string>('jobType');
const taskType = config.get<string>('taskType');
@injectable()
export class JobManagerClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  public constructor(@inject(SERVICES.LOGGER) protected readonly logger: Logger, @inject(SERVICES.CONFIG) config: IConfig) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const retryConfig = parseConfig(config.get<IHttpRetryConfig>('httpRetry'));
    super(logger, retryConfig);
    this.targetService = 'DiscreteIngestionDB'; //name of target for logs
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.axiosOptions.baseURL = config.get<string>('storageServiceURL');
  }

  public async createLayerJob(data: IngestionParams, layerRelativePath: string): Promise<string> {
    const resourceId = data.metadata.productId as string;
    const version = data.metadata.productVersion as string;
    const createLayerTasksUrl = `/jobs`;
    const createJobRequest: ICreateJobBody = {
      resourceId: resourceId,
      version: version,
      type: jobType,
      status: OperationStatus.IN_PROGRESS,
      parameters: { ...data, layerRelativePath } as unknown as Record<string, unknown>,
      producerName: data.metadata.producerName,
      productName: data.metadata.productName,
      productType: data.metadata.productType,
      tasks: [{
        parameters: data,
        type: taskType,
      }],
    };
    const res = await this.post<ICreateJobResponse>(createLayerTasksUrl, createJobRequest);
    return res.id;
  }

  public async createTask(jobId: string, taskParams: IngestionParams): Promise<void> {
    const createTasksUrl = `/jobs/${jobId}/tasks`;
    const req = {
      type: taskType,
      parameters: taskParams,
    };
    await this.post(createTasksUrl, req);
  }


  public async updateJobStatus(jobId: string, status: OperationStatus, reason?: string, catalogId?: string): Promise<void> {
    const updateTaskUrl = `/jobs/${jobId}`;
    await this.put(updateTaskUrl, {
      status: status,
      reason: reason,
      internalId: catalogId,
    });
  }

  public async findJobs(resourceId: string, version: string, productType: ProductType): Promise<IGetJobResponse[]> {
    const getLayerUrl = `/jobs`;
    const res = await this.get<IGetJobResponse[]>(getLayerUrl, { resourceId, version, type: jobType, productType: productType });
    if (typeof res === 'string' || res.length === 0) {
      return [];
    }
    return res;
  }
}
