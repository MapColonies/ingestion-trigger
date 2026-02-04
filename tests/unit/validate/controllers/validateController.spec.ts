import { faker } from '@faker-js/faker';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ValidateController } from '../../../../src/validate/controllers/validateController';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import { ValidateManager } from '../../../../src/validate/models/validateManager';
import { SchemasValidator } from '../../../../src/utils/validation/schemasValidator';

describe('ValidateController', () => {
  let validateController: ValidateController;
  let mockSchemasValidator: jest.Mocked<SchemasValidator>;
  let mockValidateManager: jest.Mocked<ValidateManager>;
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockSchemasValidator = {
      validateGpkgsInputFilesRequestBody: jest.fn(),
    } as unknown as jest.Mocked<SchemasValidator>;

    mockValidateManager = {
      validateGpkgs: jest.fn(),
    } as unknown as jest.Mocked<ValidateManager>;

    validateController = new ValidateController(mockSchemasValidator, mockValidateManager);

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    mockNext = jest.fn();
  });

  describe('validateGpkgs', () => {
    it('should pass FileNotFoundError to next middleware with NOT_FOUND status', async () => {
      const fileName = faker.system.fileName({ extensionCount: 0 }) + '.gpkg';
      const error = new FileNotFoundError(fileName);
      mockSchemasValidator.validateGpkgsInputFilesRequestBody.mockResolvedValue({ gpkgFilesPath: [fileName] });
      mockValidateManager.validateGpkgs.mockRejectedValue(error);

      await validateController.validateGpkgs(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect((error as any).status).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
