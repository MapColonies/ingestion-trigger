import { RequestHandler } from 'express';
import httpStatus from 'http-status-codes';
import { Logger } from '@map-colonies/js-logger';
import { injectable, inject } from 'tsyringe';
import { IngestionParams } from '@map-colonies/mc-model-types';
import { SERVICES } from '../../common/constants';
import { LayersManager } from '../models/layersManager';

type CreateLayerHandler = RequestHandler<undefined, undefined, IngestionParams>;

@injectable()
export class LayersController {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, @inject(LayersManager) private readonly manager: LayersManager) {}

  public createLayer: CreateLayerHandler = async (req, res, next) => {
    try {
      await this.manager.createLayer(req.body);
      return res.sendStatus(httpStatus.OK);
    } catch (err) {
      next(err);
    }
  };
}
