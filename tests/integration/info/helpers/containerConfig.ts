import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { container, instancePerContainerCachingFactory } from 'tsyringe';
import { SERVICES } from '../../../../src/common/constants';
import { InjectionObject } from '../../../../src/common/dependencyRegistration';
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, schemasValidationsFactory } from '../../../../src/utils/validation/schemasValidator';
import { configMock, getMock, hasMock, registerDefaultConfig } from '../../../mocks/configMock';

function getTestContainerConfig(): InjectionObject<unknown>[] {
  registerDefaultConfig();

  return [
    { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
    { token: SERVICES.CONFIG, provider: { useValue: configMock } },
    { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    { token: INGESTION_SCHEMAS_VALIDATOR_SYMBOL, provider: { useFactory: instancePerContainerCachingFactory(schemasValidationsFactory) } },
    { token: GDAL_INFO_MANAGER_SYMBOL, provider: { useClass: GdalInfoManager } },
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
