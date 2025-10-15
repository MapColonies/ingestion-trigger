import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { trace, Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { FindRecordResponse, IConfig } from '../common/interfaces';
import { SERVICES } from '../common/constants';

@injectable()
export class CatalogClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
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
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('catalogClient.exists');
    const res = await this.findByProductIdAndType(productId, productType);
    return res.length > 0;
  }

  @withSpanAsyncV4
  public async findById(catalogId: string): Promise<FindRecordResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('catalogClient.findByCatalogId');
    const req = {
      id: catalogId,
    };
    const res = await this.post<FindRecordResponse>('/records/find', req);
    activeSpan?.addEvent('catalogClient.findByCatalogId.response', { findByCatalogIdResponse: JSON.stringify(res) });
    return res;
  }

  @withSpanAsyncV4
  private async findByProductIdAndType(productId: string, productType: string): Promise<FindRecordResponse> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('catalogClient.findByProductIdAndType');
    const req = {
      metadata: {
        productId,
        productType,
      },
    };
    const res = await this.post<FindRecordResponse>('/records/find', req);
    activeSpan?.addEvent('catalogClient.findByProductIdAndType.response', { findByProductIdAndTypeResponse: JSON.stringify(res) });
    return res;
  }
}
