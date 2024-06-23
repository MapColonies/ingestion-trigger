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
      config.get<string>('catalogServiceURL'),
      'CatalogClient',
      config.get<IHttpRetryConfig>('httpRetry'),
      config.get<boolean>('disableHttpClientLogs')
    );
  }

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
