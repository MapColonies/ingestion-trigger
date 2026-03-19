// this import must be called before the first import of tsyringe
import 'reflect-metadata';
import { createServer } from 'http';
import { createTerminus } from '@godaddy/terminus';
import type { Logger } from '@map-colonies/js-logger';
import { container } from 'tsyringe';
import { SERVICES } from './common/constants';
import { getConfig } from './common/config';
import { getApp } from './app';

const config = getConfig();
const port: number = config.get('server.port');

const [app] = getApp();

const logger = container.resolve<Logger>(SERVICES.LOGGER);
const stubHealthCheck = async (): Promise<void> => Promise.resolve();

const server = createTerminus(createServer(app), { healthChecks: { '/liveness': stubHealthCheck, onSignal: container.resolve('onSignal') } });

server.listen(port, () => {
  logger.info(`app started on port ${port}`);
});
