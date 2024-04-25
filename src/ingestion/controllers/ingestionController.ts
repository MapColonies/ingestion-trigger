import { RequestHandler } from 'express';
import { InputFiles } from '@map-colonies/mc-model-types';
import { injectable } from 'tsyringe';
import { SourcesValidationResponse, SourcesValidationResponseWithStatusCode } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';

export type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, InputFiles>;

@injectable()
export class IngestionController {
  public constructor(private readonly ingestionManager: IngestionManager) {}

  public validateSources: SourcesValidationHandler = async (req, res, next): Promise<void> => {
    try {
      const inputFilesToValidate: unknown = req.body;
      const { isValid, message, statusCode }: SourcesValidationResponseWithStatusCode = await this.ingestionManager.validateSources(
        inputFilesToValidate
      );
      res.status(statusCode).send({ isValid, message });
    } catch (error) {
      next(error);
    }
  };
}
