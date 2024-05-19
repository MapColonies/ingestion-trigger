import { RequestHandler } from 'express';
import { InputFiles } from '@map-colonies/mc-model-types';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { SourcesValidationResponse } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';

type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, InputFiles>;

@injectable()
export class IngestionController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly ingestionManager: IngestionManager
  ) {}

  public validateSources: SourcesValidationHandler = async (req, res, next): Promise<void> => {
    try {
      const inputFilesRequestBody: unknown = req.body;
      const validInputFilesRequestBody: InputFiles = await this.schemasValidator.validateInputFilesRequestBody(inputFilesRequestBody);

      const validationResponse = await this.ingestionManager.validateSources(validInputFilesRequestBody);

      res.status(StatusCodes.OK).send(validationResponse);
    } catch (error) {
      next(error);
    }
  };
}
