import { jsLogger } from '@map-colonies/js-logger';
import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import { instancePerContainerCachingFactory } from 'tsyringe';
import { DependencyContainer } from 'tsyringe/dist/typings/types';
import xxhashFactory from 'xxhash-wasm';
import type { HashAlgorithm } from '@map-colonies/raster-shared';
import { Registry } from 'prom-client';
import { SERVICES, SERVICE_NAME } from './common/constants';
import { InjectionObject, registerDependencies } from './common/dependencyRegistration';
import { getTracing } from './common/tracing';
import { INFO_ROUTER_SYMBOL, infoRouterFactory } from './info/routes/infoRouter';
import { INGESTION_ROUTER_SYMBOL, ingestionRouterFactory } from './ingestion/routes/ingestionRouter';
import { CHECKSUM_PROCESSOR } from './utils/hash/constants';
import type { ChecksumProcessor } from './utils/hash/interfaces';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, schemasValidationsFactory } from './utils/validation/schemasValidator';
import { VALIDATE_ROUTER_SYMBOL, validateRouterFactory } from './validate/routes/validateRouter';
import { getConfig } from './common/config';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const configInstance = getConfig();

  const loggerConfig = configInstance.get('telemetry.logger');

  const logger = await jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin() });

  const tracer = trace.getTracer(SERVICE_NAME);
  const metricsRegistry = new Registry();

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: configInstance } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.METRICS, provider: { useValue: metricsRegistry } },
    { token: VALIDATE_ROUTER_SYMBOL, provider: { useFactory: validateRouterFactory } },
    { token: INGESTION_ROUTER_SYMBOL, provider: { useFactory: ingestionRouterFactory } },
    { token: INFO_ROUTER_SYMBOL, provider: { useFactory: infoRouterFactory } },
    { token: INGESTION_SCHEMAS_VALIDATOR_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(schemasValidationsFactory) } },
    {
      token: CHECKSUM_PROCESSOR,
      provider: {
        useFactory: (): (() => Promise<ChecksumProcessor>) => {
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
          await Promise.all([getTracing().stop()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
