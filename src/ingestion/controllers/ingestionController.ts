import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { ConflictError } from '@map-colonies/error-types';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { SourcesValidationResponse, ResponseStatus, IRecordRequestParams } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';
import { InfoData } from '../schemas/infoDataSchema';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError, ValidationError } from '../errors/ingestionErrors';
import { InputFiles, IngestionNewLayerRequest, IngestionUpdateLayerRequest } from '@map-colonies/raster-shared';

type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, unknown>;
type SourcesInfoHandler = RequestHandler<undefined, InfoData[], unknown>;
type NewLayerHandler = RequestHandler<undefined, ResponseStatus, unknown>;
type UpdateLayerHandler = RequestHandler<IRecordRequestParams, ResponseStatus, unknown>;

@injectable()
export class IngestionController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly ingestionManager: IngestionManager
  ) {}

  public createLayer: NewLayerHandler = async (req, res, next) => {
    try {
      const validNewLayerRequestBody: IngestionNewLayerRequest = await this.schemasValidator.validateNewLayerRequest(req.body);
      await this.ingestionManager.ingestNewLayer(validNewLayerRequestBody);

      res.status(StatusCodes.OK).send({ status: 'success' });
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

  public updateLayer: UpdateLayerHandler = async (req, res, next) => {
    try {
      const catalogId = req.params.id;
      const updateLayerRequestBody: unknown = req.body;
      const validUpdateLayerRequestBody: IngestionUpdateLayerRequest = await this.schemasValidator.validateUpdateLayerRequest(updateLayerRequestBody);
      await this.ingestionManager.updateLayer(catalogId, validUpdateLayerRequestBody);

      res.status(StatusCodes.OK).send({ status: 'success' });
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

  public validateSources: SourcesValidationHandler = async (req, res, next): Promise<void> => {
    try {
      const validInputFilesRequestBody: InputFiles = await this.schemasValidator.validateInputFilesRequestBody(req.body);

      const validationResponse = await this.ingestionManager.validateSources(validInputFilesRequestBody);

      res.status(StatusCodes.OK).send(validationResponse);
    } catch (error) {
      next(error);
    }
  };

  public getSourcesGdalInfo: SourcesInfoHandler = async (req, res, next): Promise<void> => {
    try {
      const validInputFilesRequestBody: InputFiles = await this.schemasValidator.validateInputFilesRequestBody(req.body);
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
