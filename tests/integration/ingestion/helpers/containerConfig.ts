import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { container, instancePerContainerCachingFactory } from 'tsyringe';
import { SERVICES } from '../../../../src/common/constants';
import { InjectionObject } from '../../../../src/common/dependencyRegistration';
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { CHECKSUM_PROCESSOR } from '../../../../src/utils/hash/constants';
import type { ChecksumProcessor } from '../../../../src/utils/hash/interfaces';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, schemasValidationsFactory } from '../../../../src/utils/validation/schemasValidator';
import { configMock, getMock, hasMock, registerDefaultConfig } from '../../../mocks/configMock';

interface ContainerConfigOptions {
  checksumProcessor: () => () => Promise<ChecksumProcessor>;
}

function getTestContainerConfig({ checksumProcessor }: ContainerConfigOptions): InjectionObject<unknown>[] {
  registerDefaultConfig();

  return [
    { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
    { token: SERVICES.CONFIG, provider: { useValue: configMock } },
    { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    { token: INGESTION_SCHEMAS_VALIDATOR_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(schemasValidationsFactory) } },
    { token: GDAL_INFO_MANAGER_SYMBOL, provider: { useClass: GdalInfoManager } },
    {
      token: CHECKSUM_PROCESSOR,
      provider: {
        useFactory: (): (() => Promise<ChecksumProcessor>) => {
          return checksumProcessor();
        },
      },
    },
  ];
}

const resetContainer = (clearInstances = true): void => {
  if (clearInstances) {
    container.clearInstances();
  }

  getMock.mockReset();
  hasMock.mockReset();
};

export { getTestContainerConfig, resetContainer };
