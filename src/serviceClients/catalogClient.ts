import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { FindRecordResponse, IConfig } from '../common/interfaces';
import { SERVICES } from '../common/constants';
import { Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';

@injectable()
export class CatalogClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger, @inject(SERVICES.TRACER) public readonly tracer: Tracer) {
    super(
      logger,
      config.get<string>('services.catalogServiceURL'),
      'CatalogClient',
      config.get<IHttpRetryConfig>('httpRetry'),
      config.get<boolean>('disableHttpClientLogs')
    );
  }

  @withSpanAsyncV4
  public async exists(productId: string, productType: string): Promise<boolean> {
    const req = {
      metadata: {
        productId,
        productType,
      },
    };
    const res = await this.post<FindRecordResponse>('/records/find', req);
    return res.length > 0;
  }
}
