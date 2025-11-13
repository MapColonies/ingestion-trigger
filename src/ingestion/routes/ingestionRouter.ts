import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { IngestionController } from '../controllers/ingestionController';

const ingestionRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(IngestionController);

  router.post('/', controller.newLayer.bind(controller));
  router.put('/:id', controller.updateLayer.bind(controller));

  return router;
};

export const INGESTION_ROUTER_SYMBOL = Symbol('ingestionRouterFactory');

export { ingestionRouterFactory };
