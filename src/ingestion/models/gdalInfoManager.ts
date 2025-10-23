import { Logger } from '@map-colonies/js-logger';
import { context, SpanKind, trace, Tracer } from '@opentelemetry/api';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { createSpanMetadata } from '../../common/tracing';
import { GdalUtilities } from '../../utils/gdal/gdalUtilities';
import { LogContext } from '../../utils/logger/logContext';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { GdalInfoError } from '../errors/ingestionErrors';
import { InfoDataWithFile } from '../schemas/infoDataSchema';

@injectable()
export class GdalInfoManager {
  private readonly logContext: LogContext;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly gdalUtilities: GdalUtilities
  ) {
    this.logContext = {
      fileName: __filename,
      class: GdalInfoManager.name,
    };
  }

  public async getInfoData(gpkgFilesPath: string[]): Promise<InfoDataWithFile[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };
    this.logger.debug({ msg: 'getting Gdal info data', logContext: logCtx, metadata: { gpkgFilesPath } });

    const { spanOptions } = createSpanMetadata('gdalInfoManager.getInfoData', SpanKind.INTERNAL);
    const getInfoSpan = this.tracer.startSpan('gdalInfoManager.get_info process', spanOptions);

    try {
      return await context.with(trace.setSpan(context.active(), getInfoSpan), async () => {
        const filesGdalInfoData = await Promise.all(
          gpkgFilesPath.map(async (gpkgFilePath) => {
            const infoData = await this.gdalUtilities.getInfoData(gpkgFilePath);
            getInfoSpan.addEvent('gdalInfoManager.get_info.data', { gpkgFilePath, fileInfo: JSON.stringify(infoData) });
            return { ...infoData, gpkgFilePath };
          })
        );
        return filesGdalInfoData;
      });
    } catch (err) {
      const customMessage = `failed to get gdal info data`;
      let errorMessage = customMessage;
      if (err instanceof Error) {
        errorMessage = `${customMessage}: ${err.message}`;
      }
      this.logger.error({ msg: errorMessage, err, logContext: logCtx, metadata: { gpkgFilesPath } });
      const error = new GdalInfoError(errorMessage);
      getInfoSpan.recordException(error);
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
        currentFile = infoData.gpkgFilePath;
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
      validateInfoSpan.recordException(error);
      throw error;
    } finally {
      validateInfoSpan.end();
    }
  }
}

export const GDAL_INFO_MANAGER_SYMBOL = Symbol('GdalInfoManager');
