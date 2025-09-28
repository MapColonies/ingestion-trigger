import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Metrics, getOtelMixin } from '@map-colonies/telemetry';
import { Xxh64 } from '@node-rs/xxhash';
import { metrics as OtelMetrics, trace } from '@opentelemetry/api';
import config from 'config';
import { instancePerContainerCachingFactory } from 'tsyringe';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import { CHECKSUM_PROCESSOR, SERVICES, SERVICE_NAME } from './common/constants';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { tracing } from './common/tracing';
import { INGESTION_ROUTER_SYMBOL, ingestionRouterFactory } from './ingestion/routes/ingestionRouter';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, schemasValidationsFactory } from './utils/validation/schemasValidator';
import type { HashProcessor } from './utils/hash/interface';
import { HashAlgorithm } from './utils/hash/constants';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = (options?: RegisterOptions): DependencyContainer => {
  const loggerConfig = config.get<LoggerOptions>('telemetry.logger');
  const logger = jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin() });

  const metrics = new Metrics();
  metrics.start();

  const tracer = trace.getTracer(SERVICE_NAME);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.METER, provider: { useValue: OtelMetrics.getMeterProvider().getMeter(SERVICE_NAME) } },
    { token: INGESTION_ROUTER_SYMBOL, provider: { useFactory: ingestionRouterFactory } },
    { token: INGESTION_SCHEMAS_VALIDATOR_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(schemasValidationsFactory) } },
    {
      token: CHECKSUM_PROCESSOR,
      provider: {
        useFactory: (): HashProcessor => {
          return Object.assign(new Xxh64(), { algorithm: HashAlgorithm.XXH64 });
        },
      },
    },
    {
      token: 'onSignal',
      provider: {
        useValue: {
          useValue: async (): Promise<void> => {
            await Promise.all([tracing.stop(), metrics.stop()]);
          },
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
