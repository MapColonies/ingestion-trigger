import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { FindRecordResponse, IConfig } from '../common/interfaces';
import { SERVICES } from '../common/constants';

@injectable()
export class CatalogClient extends HttpClient {
  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig, @inject(SERVICES.LOGGER) protected readonly logger: Logger) {
    super(
      logger,
      config.get<string>('services.catalogServiceURL'),
      'CatalogClient',
      config.get<IHttpRetryConfig>('httpRetry'),
      config.get<boolean>('disableHttpClientLogs')
    );
  }

  public async exists(productId: string, productType: string): Promise<boolean> {
    const res = await this.findByProductIdAndType(productId, productType);
    return res.length > 0;
  }

  public async findByInternalId(internalId: string): Promise<FindRecordResponse> {
    const req = {
      id: internalId,
    };
    return this.post<FindRecordResponse>('/records/find', req);
  }

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
