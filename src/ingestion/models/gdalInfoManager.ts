import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { SpanKind, Tracer } from '@opentelemetry/api';
import { GdalUtilities } from '../../utils/gdal/gdalUtilities';
import { SERVICES } from '../../common/constants';
import { GdalInfoError } from '../errors/ingestionErrors';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { LogContext } from '../../utils/logger/logContext';
import { InfoDataWithFile } from '../schemas/infoDataSchema';
import { createSpanMetadata } from '../../common/tracing';

@injectable()
export class GdalInfoManager {
  private readonly sourceMount: string;
  private readonly logContext: LogContext;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly gdalUtilities: GdalUtilities
  ) {
    this.logContext = {
      fileName: __filename,
      class: GdalInfoManager.name,
    };
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  public async getInfoData(originDirectory: string, files: string[]): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };
    this.logger.debug({ msg: 'getting Gdal info data', logContext: logCtx, metadata: { originDirectory, files } });

    const { spanOptions } = createSpanMetadata('gdalInfoManager.getInfoData', SpanKind.INTERNAL);
    const getInfoSpan = this.tracer.startSpan('gdalInfoManager.get_info process', spanOptions);

    try {
      const filesGdalInfoData = await Promise.all(
        files.map(async (file) => {
          const filePath = join(this.sourceMount, originDirectory, file);
          const infoData = await this.gdalUtilities.getInfoData(filePath);
          return { ...infoData, fileName: file };
        })
      );

      return filesGdalInfoData;
    } catch (err) {
      const customMessage = `failed to get gdal info data`;
      let errorMessage = customMessage;
      if (err instanceof Error) {
        errorMessage = `${customMessage}: ${err.message}`;
      }
      this.logger.error({ msg: errorMessage, err, logContext: logCtx, metadata: { originDirectory, files } });
      const error = new GdalInfoError(errorMessage);
      getInfoSpan.setAttribute('msg',error.message ).recordException(error);
      throw error;
    } finally {
      getInfoSpan.end();
    }
  }

  public async validateInfoData(infoDataArray: InfoDataWithFile[]): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateInfoData.name };
    this.logger.info({ msg: 'Validating GDAL info data', logContext: logCtx, metadata: { infoDataArray } });
    const { spanOptions } = createSpanMetadata('gdalInfoManager.validateInfoData', SpanKind.INTERNAL);
    const validateInfoSpan = this.tracer.startSpan('gdalInfoManager.validate_info process', spanOptions);
    let currentFile = '';

    try {
      for (const infoData of infoDataArray) {
        currentFile = infoData.fileName;
        this.logger.debug({ msg: 'validating gdal info data', logContext: logCtx, metadata: { infoData } });
        await this.schemasValidator.validateInfoData(infoData);
        validateInfoSpan.addEvent('gdalInfoManager.validateInfoData.pass');
      }
    } catch (err) {
      const customMessage = `failed to validate gdal info data for file: ${currentFile}`;
      let errorMessage = customMessage;
      if (err instanceof Error) {
        errorMessage = `${customMessage}: ${err.message}`;
      }

      this.logger.error({ msg: errorMessage, err, logContext: logCtx, metadata: { currentFile } });
      const error = new GdalInfoError(errorMessage);
      validateInfoSpan.setAttribute('msg', error.message).recordException(error);
      throw error;
    } finally {
      validateInfoSpan.end();
    }
  }
}

export const GDAL_INFO_MANAGER_SYMBOL = Symbol('GdalInfoManager');
