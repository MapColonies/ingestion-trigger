import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { Logger } from '@map-colonies/js-logger';
import { StatusCodes } from 'http-status-codes';
import { InputFiles } from '@map-colonies/mc-model-types';
import { BadRequestError } from '@map-colonies/error-types';
import { SERVICES } from '../../common/constants';
import { SourcesValidationResponseWithStatusCode } from '../interfaces';
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

  public async validateSources(sources: unknown): Promise<SourcesValidationResponseWithStatusCode> {
    try {
      const validatedInputFiles = await this.zodValidator.validate<z.ZodType<InputFiles>>(inputFilesSchema, sources);
      const { originDirectory, fileNames } = validatedInputFiles;

      await this.sourceValidator.validateGdalInfo(fileNames, originDirectory);

      const validResponse: SourcesValidationResponseWithStatusCode = { isValid: true, message: 'Sources are valid', statusCode: StatusCodes.OK };
      return validResponse;
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err;
      }
      const response: SourcesValidationResponseWithStatusCode = {
        isValid: false,
        message: err.message,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      };
      if (err instanceof BadRequestError) {
        response.statusCode = StatusCodes.BAD_REQUEST;
      }
      return response;
    }
  }
}
