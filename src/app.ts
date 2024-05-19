import { Application } from 'express';
import { DependencyContainer } from 'tsyringe';
import { registerExternalValues, RegisterOptions } from './containerConfig';
import { ServerBuilder } from './serverBuilder';

function getApp(registerOptions?: RegisterOptions): [Application, DependencyContainer] {
  const container = registerExternalValues(registerOptions);
  const app = container.resolve(ServerBuilder).build();
  return [app, container];
}

export { getApp };
