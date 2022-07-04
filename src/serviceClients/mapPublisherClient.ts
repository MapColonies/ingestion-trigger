import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { NotFoundError } from '@map-colonies/error-types';
import { IPublishMapLayerRequest } from '../layers/interfaces';
import { HttpClient, IHttpRetryConfig } from '@map-colonies/mc-utils';

@injectable()
export class MapPublisherClient extends HttpClient {
  public constructor(@inject(SERVICES.LOGGER) protected readonly logger: Logger, @inject(SERVICES.CONFIG) config: IConfig) {
    super(logger, config.get<string>('mapPublishingServiceURL'), 'mapLayerPublisher' ,config.get<IHttpRetryConfig>('httpRetry'));
  }

  public async publishLayer(publishReq: IPublishMapLayerRequest): Promise<IPublishMapLayerRequest> {
    const saveMetadataUrl = '/layer';
    return this.post(saveMetadataUrl, publishReq);
  }

  public async exists(name: string): Promise<boolean> {
    const saveMetadataUrl = `/layer/${name}`;
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
