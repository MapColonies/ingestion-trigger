import { ConflictError } from '@map-colonies/error-types';
import { InputFiles } from '@map-colonies/raster-shared';
import { RequestHandler } from 'express';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { FileNotFoundError, GdalInfoError, UnsupportedEntityError, ValidationError } from '../errors/ingestionErrors';
import type { IRecordRequestParams, ResponseId, SourcesValidationResponse } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';
import { InfoData } from '../schemas/infoDataSchema';

type SourcesValidationHandler = RequestHandler<undefined, SourcesValidationResponse, unknown>;
type SourcesInfoHandler = RequestHandler<undefined, InfoData[], unknown>;
type NewLayerHandler = RequestHandler<undefined, ResponseId, unknown>;
type UpdateLayerHandler = RequestHandler<IRecordRequestParams, ResponseId, unknown>;

@injectable()
export class IngestionController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly ingestionManager: IngestionManager
  ) {}

  public newLayer: NewLayerHandler = async (req, res, next) => {
    try {
      const validNewLayerRequestBody = await this.schemasValidator.validateNewLayerRequest(req.body);
      const response = await this.ingestionManager.newLayer(validNewLayerRequestBody);

      res.status(StatusCodes.OK).send(response);
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
      const validUpdateLayerRequestBody = await this.schemasValidator.validateUpdateLayerRequest(req.body);
      const response = await this.ingestionManager.updateLayer(catalogId, validUpdateLayerRequestBody);

      res.status(StatusCodes.OK).send(response);
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
