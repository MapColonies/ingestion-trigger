import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles } from '@map-colonies/mc-model-types';
import { SERVICES } from '../../common/constants';
import { SourceValidator } from '../validators/sourceValidator';
import { FileNotFoundError, GdalInfoError } from '../errors/ingestionErrors';
import { SourcesValidationResponse } from '../interfaces';
import { GpkgError } from '../../serviceClients/database/errors';
import { LogContext } from '../../utils/logger/logContext';
import { InfoData } from '../schemas/infoDataSchema';
import { GdalInfoManager } from './gdalInfoManager';

@injectable()
export class IngestionManager {
  private readonly logContext: LogContext;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly sourceValidator: SourceValidator,
    private readonly gdalInfoManager: GdalInfoManager
  ) {
    this.logContext = {
      fileName: __filename,
      class: IngestionManager.name,
    };
  }

  public async getInfoData(inputFiles: InputFiles): Promise<InfoData[]> {
    const logCtx: LogContext = { ...this.logContext, function: this.getInfoData.name };

    const { originDirectory, fileNames } = inputFiles;
    this.logger.info({ msg: 'getting gdal info for files', logContext: logCtx, metadata: { originDirectory, fileNames } });

    await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
    this.logger.debug({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

    const filesGdalInfoData = await this.gdalInfoManager.getInfoData(originDirectory, fileNames);

    return filesGdalInfoData;
  }

  public async validateSources(inputFiles: InputFiles): Promise<SourcesValidationResponse> {
    const logCtx: LogContext = { ...this.logContext, function: this.validateSources.name };
    const { originDirectory, fileNames } = inputFiles;
    try {
      this.logger.info({ msg: 'Starting source validation process', logContext: logCtx, metadata: { originDirectory, fileNames } });

      await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
      this.logger.info({ msg: 'Files exist validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

      await this.sourceValidator.validateGdalInfo(originDirectory, fileNames);
      this.logger.info({ msg: 'GDAL info validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

      this.sourceValidator.validateGpkgFiles(originDirectory, fileNames);
      this.logger.info({ msg: 'GPKG files validation passed', logContext: logCtx, metadata: { originDirectory, fileNames } });

      const validationResult: SourcesValidationResponse = { isValid: true, message: 'Sources are valid' };

      this.logger.info({
        msg: validationResult.message,
        logContext: logCtx,
        metadata: { originDirectory, fileNames, isValid: validationResult.isValid },
      });
      return validationResult;
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof GdalInfoError || err instanceof GpkgError) {
        this.logger.info({ msg: `Sources are not valid:${err.message}`, logContext: logCtx, err: err, metadata: { originDirectory, fileNames } });
        return { isValid: false, message: err.message };
      }

      this.logger.error({
        msg: `An unexpected error occurred during source validation`,
        logContext: logCtx,
        err,
        metadata: { originDirectory, fileNames },
      });

      throw err;
    }
  }
}
