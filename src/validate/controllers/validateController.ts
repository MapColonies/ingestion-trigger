import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import type { SourcesValidationResponse } from '../../ingestion/interfaces';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { ValidateManager } from '../models/validateManager';

type ValidateGpkgsHandler = RequestHandler<undefined, SourcesValidationResponse, unknown>;

@injectable()
export class ValidateController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly validateManager: ValidateManager
  ) {}

  public validateGpkgs: ValidateGpkgsHandler = async (req, res, next): Promise<void> => {
    try {
      const validGpkgInputFilesRequestBody = await this.schemasValidator.validateGpkgsInputFilesRequestBody(req.body);
      const validationResponse = await this.validateManager.validateGpkgs(validGpkgInputFilesRequestBody);
      res.status(StatusCodes.OK).send(validationResponse);
    } catch (error) {
      next(error);
    }
  };
}
