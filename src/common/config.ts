import { type ConfigInstance, config } from '@map-colonies/config';
import { rasterIngestionIngestionTriggerV1, type rasterIngestionIngestionTriggerV1Type } from '@map-colonies/schemas';

// Choose here the type of the config instance and import this type from the entire application
type ConfigType = ConfigInstance<rasterIngestionIngestionTriggerV1Type>;

let configInstance: ConfigType | undefined;

/**
 * Initializes the configuration by fetching it from the server.
 * This should only be called from the instrumentation file.
 * @returns A Promise that resolves when the configuration is successfully initialized.
 */
async function initConfig(offlineMode?:boolean): Promise<void> {
  configInstance = await config({
    configName: 'ingestion-trigger-config',
    configServerUrl: 'http://localhost:8080',
    schema: rasterIngestionIngestionTriggerV1,
    version: 1,
    offlineMode: offlineMode,
    localConfigPath: './config'
  });
}

function getConfig(): ConfigType {
  if (!configInstance) {
    throw new Error('config not initialized');
  }
  return configInstance;
}

export { getConfig, initConfig, ConfigType };