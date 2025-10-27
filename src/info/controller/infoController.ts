import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { inject, injectable } from 'tsyringe';
import { GpkgInputFiles, SourcesValidationResponse } from '../../ingestion/interfaces';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../utils/validation/schemasValidator';
import { InfoManager } from '../models/infoManager';
import { InfoData } from '../../ingestion/schemas/infoDataSchema';
import { FileNotFoundError, GdalInfoError } from '../../ingestion/errors/ingestionErrors';
import { HttpError } from '@map-colonies/error-express-handler';

type SourcesInfoHandler = RequestHandler<undefined, InfoData[], unknown>;

@injectable()
export class InfoController {
  public constructor(
    @inject(INGESTION_SCHEMAS_VALIDATOR_SYMBOL) private readonly schemasValidator: SchemasValidator,
    private readonly infoManager: InfoManager
  ) { }

  public getInfoData: SourcesInfoHandler = async (req, res, next): Promise<void> => {
    try {
      const validInputFilesRequestBody: GpkgInputFiles = await this.schemasValidator.validateGpkgInputFilesBody(req.body);
      const filesGdalInfoData = await this.infoManager.getInfoData(validInputFilesRequestBody);

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
