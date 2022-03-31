import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../common/constants';
import { NotFoundError } from '../common/exceptions/http/notFoundError';
import { IPublishMapLayerRequest } from '../layers/interfaces';
import { HttpClient, IHttpRetryConfig, parseConfig } from './clientsBase/httpClient';

@injectable()
export class MapPublisherClient extends HttpClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  public constructor(@inject(SERVICES.LOGGER) protected readonly logger: Logger, @inject(SERVICES.CONFIG) config: IConfig) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const retryConfig = parseConfig(config.get<IHttpRetryConfig>('httpRetry'));
    super(logger, retryConfig);
    this.targetService = 'LayerPublisher'; //name of target for logs
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.axiosOptions.baseURL = config.get<string>('mapPublishingServiceURL');
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
