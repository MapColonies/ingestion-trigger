import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { ValidateController } from '../controllers/validateController';

const validateRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(ValidateController);

  router.post('/gpkgs', controller.validateGpkgs.bind(controller));

  return router;
};

export const VALIDATE_ROUTER_SYMBOL = Symbol('validateRouterFactory');

export { validateRouterFactory };
