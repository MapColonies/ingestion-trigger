import { Logger } from '@map-colonies/js-logger';
import { ICreateJobBody, ICreateJobResponse, JobManagerClient } from '@map-colonies/mc-priority-queue';
import { IHttpRetryConfig } from '@map-colonies/mc-utils';
import type { IngestionNewJobParams, IngestionSwapUpdateJobParams, IngestionUpdateJobParams } from '@map-colonies/raster-shared';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import type { IConfig } from '../common/interfaces';
import { ValidationTaskParameters } from '../ingestion/interfaces';

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
  public async createNewJob(
    payload: ICreateJobBody<IngestionNewJobParams | IngestionUpdateJobParams | IngestionSwapUpdateJobParams, ValidationTaskParameters>
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
}
