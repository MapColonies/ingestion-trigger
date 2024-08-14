import { Logger } from '@map-colonies/js-logger';
import { HttpClient } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { FindRecordResponse } from '../common/interfaces';
import { SERVICES } from '../common/constants';
import { ConfigType } from '../common/config';

@injectable()
export class CatalogClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    super(logger, config.get('services.catalogServiceURL'), 'CatalogClient', config.get('httpRetry'), config.get('disableHttpClientLogs'));
  }

  @withSpanAsyncV4
  public async exists(productId: string, productType: string): Promise<boolean> {
    const res = await this.findByProductIdAndType(productId, productType);
    return res.length > 0;
  }

  @withSpanAsyncV4
  public async findByInternalId(internalId: string): Promise<FindRecordResponse> {
    const req = {
      id: internalId,
    };
    return this.post<FindRecordResponse>('/records/find', req);
  }

  @withSpanAsyncV4
  private async findByProductIdAndType(productId: string, productType: string): Promise<FindRecordResponse> {
    const req = {
      metadata: {
        productId,
        productType,
      },
    };
    return this.post<FindRecordResponse>('/records/find', req);
  }
}
