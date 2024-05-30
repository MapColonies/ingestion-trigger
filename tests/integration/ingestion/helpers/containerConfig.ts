import jsLogger from '@map-colonies/js-logger';
import { container, instancePerContainerCachingFactory } from 'tsyringe';
import { trace } from '@opentelemetry/api';
import { SERVICES } from '../../../../src/common/constants';
import { InjectionObject } from '../../../../src/common/dependencyRegistration';
import { configMock, getMock, hasMock, registerDefaultConfig } from '../../../mocks/configMock';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, schemasValidationsFactory } from '../../../../src/utils/validation/schemasValidator';
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';

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
