import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import type { ValidateGpkgsResponse } from '../interfaces';
import { ValidateManager } from '../models/validateManager';

type ValidateGpkgsHandler = RequestHandler<undefined, ValidateGpkgsResponse, unknown>;

@injectable()
export class ValidateController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly validateManager: ValidateManager
  ) {}

  public validateGpkgs: ValidateGpkgsHandler = async (req, res, next) => {
    try {
      const validGpkgInputFilesRequestBody = await this.schemasValidator.validateGpkgsInputFilesRequestBody(req.body);
      const response = await this.validateManager.validateGpkgs(validGpkgInputFilesRequestBody);
      res.status(StatusCodes.OK).send(response);
    } catch (error) {
      next(error);
    }
  };
}
