import jsLogger, { LoggerOptions } from '@map-colonies/js-logger';
import { Metrics, getOtelMixin } from '@map-colonies/telemetry';
import { metrics as OtelMetrics, trace } from '@opentelemetry/api';
import config from 'config';
import { instancePerContainerCachingFactory } from 'tsyringe';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import xxhashFactory from 'xxhash-wasm';
import { SERVICES, SERVICE_NAME } from './common/constants';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { tracing } from './common/tracing';
import { INFO_ROUTER_SYMBOL, infoRouterFactory } from './info/routes/infoRouter';
import { INGESTION_ROUTER_SYMBOL, ingestionRouterFactory } from './ingestion/routes/ingestionRouter';
import { CHECKSUM_PROCESSOR } from './utils/hash/constants';
import type { HashAlgorithm, HashProcessor } from './utils/hash/interfaces';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, schemasValidationsFactory } from './utils/validation/schemasValidator';
import { VALIDATE_ROUTER_SYMBOL, validateRouterFactory } from './validate/routes/validateRouter';

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
    { token: VALIDATE_ROUTER_SYMBOL, provider: { useFactory: validateRouterFactory } },
    { token: INGESTION_ROUTER_SYMBOL, provider: { useFactory: ingestionRouterFactory } },
    { token: INFO_ROUTER_SYMBOL, provider: { useFactory: infoRouterFactory } },
    { token: INGESTION_SCHEMAS_VALIDATOR_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(schemasValidationsFactory) } },
    {
      token: CHECKSUM_PROCESSOR,
      provider: {
        useFactory: (): (() => Promise<HashProcessor & Required<Pick<HashProcessor, 'algorithm'>>>) => {
          return async () => {
            const xxhash = await xxhashFactory();
            return Object.assign(xxhash.create64(), { algorithm: 'XXH64' as const satisfies HashAlgorithm });
          };
        },
      },
    },
    {
      token: 'onSignal',
      provider: {
        useValue: async (): Promise<void> => {
          await Promise.all([tracing.stop(), metrics.stop()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
