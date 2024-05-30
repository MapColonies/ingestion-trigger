import { RequestHandler } from 'express';
import { InputFiles } from '@map-colonies/mc-model-types';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { SourcesValidationResponse } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';
import { InfoData } from '../schemas/infoDataSchema';
import { FileNotFoundError, GdalInfoError } from '../errors/ingestionErrors';

type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, InputFiles>;
type SourcesInfoHandler = RequestHandler<undefined, InfoData[], InputFiles>;

@injectable()
export class IngestionController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly ingestionManager: IngestionManager
  ) {}

  public createLayer: RequestHandler = (req, res, next) => {
    throw new Error('Method not implemented.');
  };

  public updateLayer: RequestHandler = (req, res, next) => {
    throw new Error('Method not implemented.');
  };

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

  public getSourcesGdalInfo: SourcesInfoHandler = async (req, res, next): Promise<void> => {
    try {
      const inputFilesRequestBody: unknown = req.body;
      const validInputFilesRequestBody: InputFiles = await this.schemasValidator.validateInputFilesRequestBody(inputFilesRequestBody);
      const filesGdalInfoData = await this.ingestionManager.getInfoData(validInputFilesRequestBody);

      res.status(StatusCodes.OK).send(filesGdalInfoData);
    } catch (err) {
      if (err instanceof FileNotFoundError) {
        (err as HttpError).status = StatusCodes.NOT_FOUND;
      }

      if (err instanceof GdalInfoError) {
        (err as HttpError).status = StatusCodes.UNPROCESSABLE_ENTITY;
      }

      next(err);
    }
  };
}
