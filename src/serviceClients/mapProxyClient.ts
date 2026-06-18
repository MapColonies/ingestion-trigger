import type { Logger } from '@map-colonies/js-logger';
import { NotFoundError } from '@map-colonies/error-types';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { trace, type Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import type { ConfigType } from '../common/config';
import { SERVICES } from '../common/constants';

@injectable()
export class MapProxyClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) protected override readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    super(
      logger,
      config.get('services.mapProxyApiServiceUrl') as unknown as string,
      'LayerPublisher',
      config.get('httpRetry') as IHttpRetryConfig,
      config.get('disableHttpClientLogs') as boolean
    );
  }

  @withSpanAsyncV4
  public async exists(name: string): Promise<boolean> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('mapProxyClient.exists');
    const saveMetadataUrl = `/layer/${encodeURIComponent(name)}`;
    try {
      await this.get(saveMetadataUrl);
      return true;
    } catch (err) {
      if (err instanceof NotFoundError) {
        return false;
      } else {
        throw err;
      }
    }
  }
}
