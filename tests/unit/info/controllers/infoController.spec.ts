import { faker } from '@faker-js/faker';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { InfoController } from '../../../../src/info/controllers/infoController';
import { FileNotFoundError, GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { InfoManager } from '../../../../src/info/models/infoManager';
import { SchemasValidator } from '../../../../src/utils/validation/schemasValidator';

describe('InfoController', () => {
  let infoController: InfoController;
  let mockSchemasValidator: jest.Mocked<SchemasValidator>;
  let mockInfoManager: jest.Mocked<InfoManager>;
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockSchemasValidator = {
      validateGpkgsInputFilesRequestBody: jest.fn(),
    } as unknown as jest.Mocked<SchemasValidator>;

    mockInfoManager = {
      getGpkgsInfo: jest.fn(),
    } as unknown as jest.Mocked<InfoManager>;

    infoController = new InfoController(mockSchemasValidator, mockInfoManager);

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    mockNext = jest.fn();
  });

  describe('getGpkgsInfo', () => {
    it('should pass FileNotFoundError to next middleware with NOT_FOUND status', async () => {
      const fileName = faker.system.fileName({ extensionCount: 0 }) + '.gpkg';
      const error = new FileNotFoundError(fileName);
      mockSchemasValidator.validateGpkgsInputFilesRequestBody.mockResolvedValue({ gpkgFilesPath: [fileName] });
      mockInfoManager.getGpkgsInfo.mockRejectedValue(error);

      await infoController.getGpkgsInfo(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const calledError = mockNext.mock.calls[0][0];
      expect(calledError).toBeInstanceOf(FileNotFoundError);
      expect((calledError as any).status).toBe(StatusCodes.NOT_FOUND);
    });

    it('should pass GdalInfoError to next middleware with UNPROCESSABLE_ENTITY status', async () => {
      const errorMessage = 'Error while getting gdal info';
      const fileName = faker.system.fileName({ extensionCount: 0 }) + '.gpkg';
      const error = new GdalInfoError(errorMessage);
      mockSchemasValidator.validateGpkgsInputFilesRequestBody.mockResolvedValue({ gpkgFilesPath: [fileName] });
      mockInfoManager.getGpkgsInfo.mockRejectedValue(error);

      await infoController.getGpkgsInfo(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const calledError = mockNext.mock.calls[0][0];
      expect(calledError).toBeInstanceOf(GdalInfoError);
      expect((calledError as any).status).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
    });
  });
});
