/* eslint-disable @typescript-eslint/await-thenable */
import { Request, Response, NextFunction } from 'express';
import jsLogger from '@map-colonies/js-logger';
import { InputFiles } from '@map-colonies/mc-model-types';
import { IngestionController, SourcesValidationHandler } from '../../../../src/ingestion/controllers/ingestionController';
import { IngestionManager } from '../../../../src/ingestion/models/ingestionManager';
import { SourcesValidationResponse, SourcesValidationResponseWithStatusCode } from '../../../../src/ingestion/interfaces';
import { ZodValidator } from '../../../../src/utils/zodValidator';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';

describe('IngestionController', () => {
  let ingestionController: IngestionController;
  let ingestionManager: IngestionManager;
  let mockRequest: Partial<Request<SourcesValidationHandler>>;
  let mockResponse: Partial<Response>;
  const nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    const zodValidator: ZodValidator = {} as ZodValidator;
    const sourceValidator: SourceValidator = {} as SourceValidator;

    ingestionManager = new IngestionManager(jsLogger({ enabled: false }), zodValidator, sourceValidator);
    ingestionController = new IngestionController(ingestionManager);
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  test('validateSources - valid sources', async () => {
    const validSources: InputFiles = {
      originDirectory: 'validDirectory',
      fileNames: ['valid.gpkg'],
    };
    mockRequest.body = validSources;

    const validationResponse: SourcesValidationResponseWithStatusCode = {
      isValid: true,
      message: 'Sources are valid.',
      statusCode: 200,
    };

    jest.spyOn(ingestionManager, 'validateSources').mockResolvedValue(validationResponse);
    await ingestionController.validateSources(
      mockRequest as unknown as Request<undefined, SourcesValidationResponse, InputFiles>,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith({ isValid: true, message: 'Sources are valid.' });
  });

  test('validateSources - invalid sources', async () => {
    const invalidSources = {
      originDirectory: 'invalidDirectory',
      fileNames: ['invalid.png'],
    };
    mockRequest.body = invalidSources;

    const validationResponse: SourcesValidationResponseWithStatusCode = {
      isValid: false,
      message: 'Sources are invalid.',
      statusCode: 400,
    };

    jest.spyOn(ingestionManager, 'validateSources').mockResolvedValue(validationResponse);

    await ingestionController.validateSources(
      mockRequest as unknown as Request<undefined, SourcesValidationResponse, InputFiles>,
      mockResponse as Response,
      nextFunction
    );
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.send).toHaveBeenCalledWith({ isValid: false, message: 'Sources are invalid.' });
  });
});
