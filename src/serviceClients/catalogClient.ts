import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import type { IConfig } from '../common/interfaces';
import type { RasterLayersCatalog } from '../ingestion/schemas/layerCatalogSchema';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, type SchemasValidator } from '../utils/validation/schemasValidator';

@injectable()
export class CatalogClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator
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
  public async findById(catalogId: string): Promise<RasterLayersCatalog> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('catalogClient.findByCatalogId');
    const req = {
      id: catalogId,
    };
    const res = await this.post('/records/find', req);
    activeSpan?.addEvent('catalogClient.findByCatalogId.response', { findByCatalogIdResponse: JSON.stringify(res) });

    // TODO: resolve correct type
    return res as RasterLayersCatalog;
  }

  @withSpanAsyncV4
  private async findByProductIdAndType(productId: string, productType: string): Promise<RasterLayersCatalog> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('catalogClient.findByProductIdAndType');
    const req = {
      metadata: {
        productId,
        productType,
      },
    };
    const res = await this.post('/records/find', req);
    activeSpan?.addEvent('catalogClient.findByProductIdAndType.response', { findByProductIdAndTypeResponse: JSON.stringify(res) });

    // TODO: resolve correct type
    // const rasterLayersCatalog = this.schemasValidator.validateRasterLayersCatalog(res);
    return res as RasterLayersCatalog;
  }
}
