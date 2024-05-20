import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { GdalUtilities } from '../../utils/gdal/gdalUtilities';
import { SERVICES } from '../../common/constants';
import { GdalInfoError } from '../errors/ingestionErrors';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { LogContext } from '../../utils/logger/logContext';
import { InfoData } from '../schemas/infoDataSchema';

@injectable()
export class GdalInfoManager {
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
      class: GdalInfoManager.name,
    };
    this.sourceMount = this.config.get<string>('storageExplorer.layerSourceDir');
  }

  public async getFilesGdalInfoData(originDirectory: string, files: string[]): Promise<InfoData[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getFilesGdalInfoData.name };
    this.logger.info({ msg: 'getting Gdal info data', logContext: logCtx, metadata: { originDirectory, files } });
    const filesGdalInfoData = this.validateInfoData(originDirectory, files);
    return filesGdalInfoData;
  }

  public async validateInfoData(originDirectory: string, files: string[]): Promise<InfoData[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateInfoData.name };
    this.logger.info({ msg: 'Validating GDAL info data files', logContext: logCtx, metadata: { originDirectory, files } });
    let currentFile = '';

    try {
      const filesGdalInfoData = await Promise.all(
        files.map(async (file) => {
          currentFile = file;
          const filePath = join(this.sourceMount, originDirectory, file);
          const infoData = await this.gdalUtilities.getInfoData(filePath);
          const validInfoData = await this.schemasValidator.validateInfoData(infoData);
          return validInfoData;
        })
      );

      this.logger.info({ msg: 'GDAL info data files are valid', logContext: logCtx, metadata: { originDirectory, files } });

      return filesGdalInfoData;
    } catch (err) {
      const customMessage = `failed to validate gdal info data for file: ${currentFile}`;
      let errorMessage = customMessage;
      if (err instanceof Error) {
        errorMessage = `${customMessage}: ${err.message}`;
      }

      this.logger.error({ msg: errorMessage, err, logContext: logCtx, metadata: { originDirectory, files } });
      throw new GdalInfoError(errorMessage);
    }
  }
}
