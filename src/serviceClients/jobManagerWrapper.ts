import { Logger } from '@map-colonies/js-logger';
import { ICreateJobBody, ICreateJobResponse, JobManagerClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import type {
  IngestionNewJobParams,
  IngestionSwapUpdateJobParams,
  IngestionUpdateJobParams,
  IngestionValidationTaskParams,
} from '@map-colonies/raster-shared';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import type { IConfig } from '../common/interfaces';

@injectable()
export class JobManagerWrapper extends JobManagerClient {
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
  }

  @withSpanAsyncV4
  public async createIngestionJob(
    payload: ICreateJobBody<IngestionNewJobParams | IngestionUpdateJobParams | IngestionSwapUpdateJobParams, IngestionValidationTaskParams>
  ): Promise<ICreateJobResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('jobManagerWrapper.createJobWrapper');

    try {
      const jobResponse = await this.createJob(payload);
      return jobResponse;
    } catch (err) {
      const message = 'failed to create a new job';
      this.logger.error({ msg: message, err, layer: payload.parameters });
      throw err;
    }
  }

  @withSpanAsyncV4
  public async resetJob(jobId: string): Promise<void> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('jobManagerWrapper.resetJob');

    try {
      await this.post(`${this.baseUrl}/jobs/${jobId}/reset`, {});
      this.logger.info({ msg: 'successfully reset job', jobId });
    } catch (err) {
      const message = `failed to reset job with id: ${jobId}`;
      this.logger.error({ msg: message, err, jobId });
      throw err;
    }
  }
}
