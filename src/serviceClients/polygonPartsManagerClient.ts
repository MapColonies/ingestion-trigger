import type { Logger } from '@map-colonies/js-logger';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';
import { inject, injectable } from 'tsyringe';
import { trace, type Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/telemetry';
import { NotFoundError } from '@map-colonies/error-types';
import { RasterProductTypes } from '@map-colonies/raster-shared';
import type { ConfigType } from '../common/config';
import { SERVICES } from '../common/constants';

@injectable()
export class PolygonPartsManagerClient extends HttpClient {
  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) protected override readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer
  ) {
    super(
      logger,
      config.get('services.polygonPartsManagerURL') as unknown as string,
      'PolygonPartsManager',
      config.get('httpRetry') as IHttpRetryConfig,
      config.get('disableHttpClientLogs') as boolean
    );
  }

  @withSpanAsyncV4
  public async deleteValidationEntity(productId: string, productType: RasterProductTypes): Promise<void> {
    const activeSpan = trace.getActiveSpan();
    activeSpan?.updateName('polygonPartsManagerClient.deleteValidationEntity');
    const validatePolygonPartsPath = `/polygonParts/validate`;
    try {
      await this.delete(validatePolygonPartsPath, { productType, productId });
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
