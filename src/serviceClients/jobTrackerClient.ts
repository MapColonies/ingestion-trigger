import type { IConfig } from 'config';
import type { Logger } from '@map-colonies/js-logger';
import { ITaskResponse } from '@map-colonies/mc-priority-queue';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { HttpClient } from '@map-colonies/mc-utils';
import type { IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';

@injectable()
export class JobTrackerClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) private readonly tracer: Tracer
  ) {
    const serviceName = 'JobTracker';
    const baseUrl = config.get<string>('services.jobTrackerServiceURL');
    const httpRetryConfig = config.get<IHttpRetryConfig>('httpRetry');
    const disableHttpClientLogs = config.get<boolean>('disableHttpClientLogs');
    super(logger, baseUrl, serviceName, httpRetryConfig, disableHttpClientLogs);
  }

  public async notify(task: ITaskResponse<unknown>): Promise<void> {
    await context.with(trace.setSpan(context.active(), this.tracer.startSpan(`${JobTrackerClient.name}.${this.notify.name}`)), async () => {
      const activeSpan = trace.getActiveSpan();
      const monitorAttributes = { taskId: task.id, status: task.status, type: task.type };
      const logger = this.logger.child(monitorAttributes);
      activeSpan?.setAttributes(monitorAttributes);

      try {
        const url = `tasks/${task.id}/notify`;
        logger.info({ msg: 'Notifying job tracker', url, ...monitorAttributes });
        activeSpan?.addEvent('notify.sending', { url });
        await this.post(url);
        activeSpan?.setStatus({ code: SpanStatusCode.OK, message: 'Notification sent successfully' });
      } catch (err) {
        if (err instanceof Error) {
          const message = 'Failed to notify job tracker';
          const error = new Error(`${message}: ${err.message}`);
          logger.error({ msg: 'Failed to notify job tracker', error: err });
          activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          activeSpan?.recordException(error);
          throw error;
        }
      } finally {
        activeSpan?.end();
      }
    });
  }
}
