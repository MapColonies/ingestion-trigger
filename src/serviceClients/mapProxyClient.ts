import { Logger } from '@map-colonies/js-logger';
import { NotFoundError } from '@map-colonies/error-types';
import { HttpClient } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { SERVICES } from '../common/constants';
import { ConfigType } from '../common/config';

@injectable()
export class MapProxyClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    super(logger, config.get('services.mapProxyApiServiceUrl'), 'LayerPublisher', config.get('httpRetry'), config.get('disableHttpClientLogs'));
  }

  @withSpanAsyncV4
  public async exists(name: string): Promise<boolean> {
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
