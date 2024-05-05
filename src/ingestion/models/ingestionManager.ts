import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import { InputFiles } from '@map-colonies/mc-model-types';
import { SERVICES } from '../../common/constants';
import { SourceValidator } from '../validators/sourceValidator';
import { FileNotFoundError, GdalInfoError } from '../errors/ingestionErrors';
import { SourcesValidationResponse } from '../interfaces';
import { InvalidGpkgError } from '../../serviceClients/database/errors';

@injectable()
export class IngestionManager {
  private readonly className = IngestionManager.name;

  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, private readonly sourceValidator: SourceValidator) {}

  public async validateSources(inputFiles: InputFiles): Promise<SourcesValidationResponse> {
    try {
      const { originDirectory, fileNames } = inputFiles;

      await this.sourceValidator.validateFilesExist(originDirectory, fileNames);
      await this.sourceValidator.validateGdalInfo(originDirectory, fileNames);
      this.sourceValidator.validateGpkgFiles(fileNames, originDirectory);

      return { isValid: true, message: 'Sources are valid' };
    } catch (err) {
      if (err instanceof FileNotFoundError || err instanceof GdalInfoError || err instanceof InvalidGpkgError) {
        return { isValid: false, message: err.message };
      }
      throw err;
    }
  }
}
