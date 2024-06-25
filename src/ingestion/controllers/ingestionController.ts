import { RequestHandler } from 'express';
import { InputFiles, NewRasterLayer } from '@map-colonies/mc-model-types';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { ConflictError } from '@map-colonies/error-types';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { SourcesValidationResponse, ResponseStatus } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';
import { InfoData } from '../schemas/infoDataSchema';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError, ValidationError } from '../errors/ingestionErrors';

type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, InputFiles>;
type SourcesInfoHandler = RequestHandler<undefined, InfoData[], InputFiles>;
type NewLayerHandler = RequestHandler<undefined, ResponseStatus, NewRasterLayer>;

@injectable()
export class IngestionController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly ingestionManager: IngestionManager
  ) {}

  public createLayer: NewLayerHandler = async (req, res, next) => {
    try {
      const newLayerRequestBody: unknown = req.body;
      const validNewLayerRequestBody: NewRasterLayer = await this.schemasValidator.validateNewLayerRequest(newLayerRequestBody);
      await this.ingestionManager.validateIngestion(validNewLayerRequestBody);

      res.status(StatusCodes.OK).send({ message: 'success' });
    } catch (error) {
      if (error instanceof ValidationError) {
        (error as HttpError).status = StatusCodes.BAD_REQUEST; //400
      }
      if (error instanceof ConflictError) {
        (error as HttpError).status = StatusCodes.CONFLICT; //409
      }
      if (error instanceof UnsupportedEntityError) {
        (error as HttpError).status = StatusCodes.UNPROCESSABLE_ENTITY; //422
      }
      next(error);
    }
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
