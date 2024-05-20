import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { IngestionController } from '../controllers/ingestionController';

const ingestionRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(IngestionController);

  // router.post('/', controller.createLayer.bind(controller));
  // router.put('/:id', controller.updateLayer.bind(controller));
  router.post('/validateSources', controller.validateSources.bind(controller));
  router.post('/sourcesInfo', controller.getSourcesGdalInfo.bind(controller));

  return router;
};

export const INGESTION_ROUTER_SYMBOL = Symbol('ingestionRouterFactory');

export { ingestionRouterFactory };
