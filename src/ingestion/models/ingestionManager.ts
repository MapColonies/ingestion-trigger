import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { Logger } from '@map-colonies/js-logger';
import { BadRequestError } from '@map-colonies/error-types';
import { InputFiles } from '@map-colonies/mc-model-types';
import { SERVICES } from '../../common/constants';
import { SourcesValidationResponse } from '../interfaces';
import { ZodValidator } from '../../utils/zodValidator';
import { inputFilesSchema } from '../schemas/inputFilesSchema';
import { SourceValidator } from '../validators/sourceValidator';

@injectable()
export class IngestionManager {
  private readonly className = IngestionManager.name;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly zodValidator: ZodValidator,
    private readonly sourceValidator: SourceValidator
  ) {}

  public async validateSources(sources: unknown): Promise<SourcesValidationResponse> {
    try {
      const validatedInputFiles = await this.zodValidator.validate<z.ZodType<InputFiles>>(inputFilesSchema, sources);
      const { originDirectory, fileNames } = validatedInputFiles;

      this.logger.debug({
        files: fileNames,
        originDirectory: originDirectory,
        msg: 'validating gdal info for files',
      });
      await this.sourceValidator.validateGdalInfo(fileNames, originDirectory);

      const validResponse: SourcesValidationResponse = { isValid: true, message: 'Sources are valid' };
      return validResponse;
    } catch (err) {
      if (!(err instanceof BadRequestError)) {
        throw err;
      }
      const response: SourcesValidationResponse = { isValid: false, message: err.message };
      return response;
    }
  }
}
