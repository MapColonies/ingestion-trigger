import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { GdalUtilities } from '../../utils/gdal/gdalUtilities';
import { SERVICES } from '../../common/constants';
import { GdalInfoError } from '../errors/ingestionErrors';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { LogContext } from '../../utils/logger/logContext';

@injectable()
export class GdalInfoValidator {
  private readonly sourceMount: string;
  private readonly logContext: LogContext;
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.CONFIG) private readonly config: IConfig,
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly gdalUtilities: GdalUtilities
  ) {
    this.logContext = {
      fileName: __filename,
      class: GdalInfoValidator.name,
    };
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  public async validateInfoData(files: string[], originDirectory: string): Promise<void> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateInfoData.name };
    this.logger.info({ msg: 'Validating GDAL info data files', logContext: logCtx, metadata: { originDirectory, files } });
    let currentFile = '';

    try {
      await Promise.all(
        files.map(async (file) => {
          currentFile = file;
          const filePath = join(this.sourceMount, originDirectory, file);
          const infoData = await this.gdalUtilities.getInfoData(filePath);
          await this.schemasValidator.validateInfoData(infoData);
        })
      );
      this.logger.info({ msg: 'GDAL info data files are valid', logContext: logCtx });
    } catch (err) {
      const customMessage = `failed to validate gdal info data for file: ${currentFile}`;
      const errorMessage = err instanceof Error ? `${customMessage}: ${err.message}` : customMessage;
      this.logger.error({ msg: errorMessage, err, logContext: logCtx });
      throw new GdalInfoError(errorMessage);
    }
  }
}
