import { RequestHandler } from 'express';
import { InputFiles } from '@map-colonies/mc-model-types';
import { injectable } from 'tsyringe';
import { SourcesValidationResponse } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';

type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, InputFiles>;

@injectable()
export class IngestionController {
  public constructor(private readonly ingestionManager: IngestionManager) {}

  public validateSources: SourcesValidationHandler = async (req, res, next) => {
    try {
      const inputFilesToValidate: unknown = req.body;
      const sourcesValidationResponse = await this.ingestionManager.validateSources(inputFilesToValidate);
      return res.json(sourcesValidationResponse);
    } catch (error) {
      next(error);
    }
  };
}
