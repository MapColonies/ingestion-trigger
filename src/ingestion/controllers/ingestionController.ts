import { ConflictError } from '@map-colonies/error-types';
import { RequestHandler } from 'express';
import { HttpError } from 'express-openapi-validator/dist/framework/types';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { GpkgError } from '../../serviceClients/database/errors';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { FileNotFoundError, UnsupportedEntityError, ValidationError } from '../errors/ingestionErrors';
import type { IRetryRequestParams, IRecordRequestParams, ResponseId } from '../interfaces';
import { IngestionManager } from '../models/ingestionManager';

type NewLayerHandler = RequestHandler<undefined, ResponseId, unknown>;
type RetryIngestionHandler = RequestHandler<IRetryRequestParams, ResponseId, unknown>;
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
      } else if (error instanceof FileNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND; //404
      } else if (error instanceof ConflictError) {
        (error as HttpError).status = StatusCodes.CONFLICT; //409
      } else if (error instanceof UnsupportedEntityError) {
        (error as HttpError).status = StatusCodes.UNPROCESSABLE_ENTITY; //422
      }
      next(error);
    }
  };

  public updateLayer: UpdateLayerHandler = async (req, res, next) => {
    try {
      const { paramsId: catalogId, reqBody: validUpdateLayerRequestBody } = await this.schemasValidator.validateUpdateLayerRequest({
        reqBody: req.body,
        paramsId: req.params.id,
      });
      const response = await this.ingestionManager.updateLayer(catalogId, validUpdateLayerRequestBody);

      res.status(StatusCodes.OK).send(response);
    } catch (error) {
      if (error instanceof ValidationError) {
        (error as HttpError).status = StatusCodes.BAD_REQUEST; //400
      } else if (error instanceof FileNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND; //404
      } else if (error instanceof ConflictError) {
        (error as HttpError).status = StatusCodes.CONFLICT; //409
      } else if (error instanceof UnsupportedEntityError || error instanceof GpkgError) {
        (error as HttpError).status = StatusCodes.UNPROCESSABLE_ENTITY; //422
      }
      next(error);
    }
  };

  public retryIngestion: RetryIngestionHandler = async (req, res, next) => {
    try {
      const response = await this.ingestionManager.retryIngestion(req.params.jobId);

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
}
