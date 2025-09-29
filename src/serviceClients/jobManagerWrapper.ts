import { Logger } from '@map-colonies/js-logger';
import { ICreateJobBody, ICreateJobResponse, JobManagerClient, OperationStatus } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import type { IngestionNewJobParams, IngestionSwapUpdateJobParams, IngestionUpdateJobParams } from '@map-colonies/raster-shared';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { IConfig, LayerDetails } from '../common/interfaces';
import { ValidationTaskParameters } from '../ingestion/interfaces';
import type { IngestionNewLayer } from '../ingestion/schemas/ingestionLayerSchema';
import type { IngestionUpdateLayer } from '../ingestion/schemas/updateLayerSchema';
import type { Checksum } from '../utils/hash/interface';

@injectable()
export class JobManagerWrapper extends JobManagerClient {
  private readonly jobDomain: string;
  private readonly ingestionNewJobType: string;
  private readonly updateJobType: string;
  private readonly validationTaskType: string;
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
    this.validationTaskType = config.get<string>('jobManager.validationTaskType');
    this.updateJobType = config.get<string>('jobManager.ingestionUpdateJobType');
    this.jobTrackerServiceUrl = config.get<string>('services.jobTrackerServiceURL');
  }

  @withSpanAsyncV4
  public async createValidationJob(data: IngestionNewLayer, checksum: Checksum): Promise<ICreateJobResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('jobManagerWrapper.createValidationJob');
    const taskParams: ValidationTaskParameters = { checksums: [checksum] };

    try {
      const ingestionNewJobParams: IngestionNewJobParams = {
        ...data,
        additionalParams: { jobTrackerServiceURL: this.jobTrackerServiceUrl },
      };
      const initialProductVersion = '1.0';
      const createJobRequest: ICreateJobBody<IngestionNewJobParams, ValidationTaskParameters> = {
        resourceId: data.metadata.productId,
        version: initialProductVersion,
        type: this.ingestionNewJobType,
        status: OperationStatus.PENDING,
        parameters: ingestionNewJobParams,
        productName: data.metadata.productName,
        productType: data.metadata.productType,
        domain: this.jobDomain,
        tasks: [{ type: this.validationTaskType, parameters: taskParams }],
      };
      const jobResponse = await this.createJob(createJobRequest);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new validation job';
      this.logger.error({ msg: message, err, layer: data });
      throw err;
    }
  }

  @withSpanAsyncV4
  public async createValidationUpdateJob(
    layerDetails: LayerDetails,
    catalogId: string,
    data: IngestionUpdateLayer,
    jobType: string,
    checksum: Checksum
  ): Promise<ICreateJobResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('jobManagerWrapper.createValidationUpdateJob');
    const taskParams: ValidationTaskParameters = { checksums: [checksum] };

    try {
      const { productId, productName, productType, productVersion, tileOutputFormat, displayPath, footprint } = layerDetails;
      const ingestionUpdateJobParams: IngestionUpdateJobParams | IngestionSwapUpdateJobParams = {
        ...data,
        additionalParams: {
          footprint,
          tileOutputFormat,
          jobTrackerServiceURL: this.jobTrackerServiceUrl,
          ...(jobType === this.updateJobType && { displayPath }),
        },
      };
      const createJobRequest: ICreateJobBody<IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ValidationTaskParameters> = {
        resourceId: productId,
        version: (parseFloat(productVersion) + 1).toFixed(1),
        internalId: catalogId,
        type: jobType,
        productName: productName,
        productType: productType,
        status: OperationStatus.PENDING,
        parameters: ingestionUpdateJobParams,
        domain: this.jobDomain,
        tasks: [{ type: this.validationTaskType, parameters: taskParams }],
      };
      const jobResponse = await this.createJob(createJobRequest);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new validation update job';
      this.logger.error({ msg: message, jobType, taskType: this.validationTaskType, err, layer: data });
      throw err;
    }
  }
}
