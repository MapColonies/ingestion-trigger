import { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { trace, Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { NotFoundError } from '@map-colonies/error-types';
import { RasterProductTypes } from '@map-colonies/raster-shared';
import { IConfig } from '../common/interfaces';
import { SERVICES } from '../common/constants';

@injectable()
export class PolygonPartsManagerClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.LOGGER) protected readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    super(
      logger,
      config.get<string>('services.polygonPartsManagerURL'),
      'PolygonPartsManager',
      config.get<IHttpRetryConfig>('httpRetry'),
      config.get<boolean>('disableHttpClientLogs')
    );
  }

  @withSpanAsyncV4
  public async deleteValidationEntity(productId: string, productType: RasterProductTypes): Promise<void> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartsManagerClient.deleteValidationEntity');
    const saveMetadataUrl = `/polygonParts/validate`;
    try {
      await this.delete(saveMetadataUrl, { productType, productId });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return;
      }
      const message = 'failed to delete polygon parts validation entity';
      this.logger.error({ msg: message, err, productId, productType });
      throw err;
    }
  }
}
