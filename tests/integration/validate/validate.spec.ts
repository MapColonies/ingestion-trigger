import { faker } from '@faker-js/faker';
import { SqliteError } from 'better-sqlite3';
import gdal from 'gdal-async';
import httpStatusCodes from 'http-status-codes';
import { unset } from 'lodash';
import nock from 'nock';
import { getApp } from '../../../src/app';
import { Grid } from '../../../src/ingestion/interfaces';
import { GpkgManager } from '../../../src/ingestion/models/gpkgManager';
import { SourceValidator } from '../../../src/ingestion/validators/sourceValidator';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import type { GpkgInputFiles } from '../../../src/utils/validation/schemasValidator';
import { ZodValidator } from '../../../src/utils/validation/zodValidator';
import { getGpkgsFilesLocalPath, rasterLayerInputFilesGenerators } from '../../mocks/mockFactory';
import { validInputFiles } from '../../mocks/static/exampleData';
import type { DeepPartial, DeepRequired, FlattenKeyTupleUnion } from '../../utils/types';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';
import { ValidateRequestSender } from './helpers/validateRequestSender';

describe('Validate', () => {
  let requestSender: ValidateRequestSender;
  let validateFilesExistSpy: jest.SpyInstance;
  let validateGdalInfoSpy: jest.SpyInstance;
  let validateGpkgFilesSpy: jest.SpyInstance;

  beforeEach(() => {
    const [app] = getApp({
      override: [...getTestContainerConfig()],
    });

    requestSender = new ValidateRequestSender(app);

    validateFilesExistSpy = jest.spyOn(SourceValidator.prototype, 'validateFilesExist');
    validateGdalInfoSpy = jest.spyOn(SourceValidator.prototype, 'validateGdalInfo');
    validateGpkgFilesSpy = jest.spyOn(SourceValidator.prototype, 'validateGpkgFiles');
  });

  afterEach(() => {
    resetContainer();
    jest.restoreAllMocks();
    nock.cleanAll();
  });

  describe('POST /validate/gpkgs', () => {
    describe('Happy Path', () => {
      it('should return 200 status code and sources is valid response', async () => {
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', true);
        expect(response.body).toHaveProperty('message', 'Sources are valid');
      });

      it('should return 200 status code and sources invalid response - unsupported CRS', async () => {
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['invalidCrs-3857.gpkg']) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - unsupported pixel size', async () => {
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['invalidPixelSize-0.8.gpkg']) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - unsupported file', async () => {
        const invalidateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['invalid.gpkg']) };

        const response = await requestSender.validateGpkgs(invalidateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - failed to get gdal info gdal.infoAsync', async () => {
        jest.spyOn(gdal, 'infoAsync').mockRejectedValue(new Error('failed to read file'));
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - failed to open gdal dataset gdal.openAsync', async () => {
        jest.spyOn(gdal, 'openAsync').mockRejectedValue(new Error('failed to read file'));
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - gpkg index not exist', async () => {
        const validateGpkgIndexSpy = jest.spyOn(GpkgManager.prototype as unknown as { validateGpkgIndex: jest.Mock }, 'validateGpkgIndex');
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['withoutGpkgIndex.gpkg']) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgIndexSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgIndexSpy).toThrow();
        expect(validateGpkgFilesSpy).toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - unsupported grid', async () => {
        const validateGpkgGridSpy = jest.spyOn(GpkgManager.prototype as unknown as { validateGpkgGrid: jest.Mock }, 'validateGpkgGrid');
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['unsupportedGridMatrix.gpkg']) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgGridSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgGridSpy).toThrow();
        expect(validateGpkgFilesSpy).toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });

      it('should return 200 status code and sources invalid response - unsupported tile size', async () => {
        const validateTilesSizeSpy = jest.spyOn(GpkgManager.prototype as unknown as { validateTilesSize: jest.Mock }, 'validateTilesSize');
        const validateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['unsupportedTileSize-width-512.gpkg']) };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(validateTilesSizeSpy).toHaveBeenCalledTimes(1);
        expect(validateTilesSizeSpy).toThrow();
        expect(validateGpkgFilesSpy).toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
      });
    });

    describe('Bad Path', () => {
      let zodValidatorSpy: jest.SpyInstance;
      beforeEach(() => {
        zodValidatorSpy = jest.spyOn(ZodValidator.prototype, 'validate');
      });
      afterEach(() => {
        zodValidatorSpy.mockClear();
      });

      const badRequestBodyTestCases: {
        testCase: string;
        badRequest: DeepPartial<GpkgInputFiles>;
        removeProperty?: FlattenKeyTupleUnion<DeepRequired<GpkgInputFiles>>;
      }[] = [
        {
          testCase: 'req body is not an object',
          badRequest: '' as DeepPartial<GpkgInputFiles>,
        },
        {
          testCase: 'gpkgFilesPath in req body is not set',
          badRequest: { gpkgFilesPath: [''] },
          removeProperty: ['gpkgFilesPath'],
        },
        {
          testCase: 'gpkgFilesPath in req body is not an array',
          badRequest: { gpkgFilesPath: '' } as unknown as DeepPartial<GpkgInputFiles>,
        },
        {
          testCase: 'gpkgFilesPath in req body is an empty array',
          badRequest: { gpkgFilesPath: [] },
        },
        {
          testCase: 'gpkgFilesPath in req body is not an array of strings',
          badRequest: { gpkgFilesPath: [1] } as unknown as DeepPartial<GpkgInputFiles>,
        },
        {
          testCase: 'gpkgFilesPath in req body is an array of strings not matching a file pattern',
          badRequest: { gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '] },
        },
        {
          testCase: 'gpkgFilesPath in req body is an array with more than 1 item',
          badRequest: {
            gpkgFilesPath: faker.helpers.multiple(() => rasterLayerInputFilesGenerators.gpkgFilesPath()[0], { count: { min: 2, max: 10 } }),
          },
        },
      ];

      it.each(badRequestBodyTestCases)('should return 400 status code when invalid input - $testCase', async ({ badRequest, removeProperty }) => {
        if (removeProperty) {
          unset(badRequest, removeProperty);
        }

        const response = await requestSender.validateGpkgs(badRequest as GpkgInputFiles);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });
    });

    describe('Sad Path', () => {
      beforeEach(() => {
        jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
          throw new SqliteError('failed read sqlite file', 'SQLITE_ERROR');
        });
      });

      it('should return 404 status code and sources invalid response - file does not exist', async () => {
        const validateGpkgsRequest = { gpkgFilesPath: rasterLayerInputFilesGenerators.gpkgFilesPath() };

        const response = await requestSender.validateGpkgs(validateGpkgsRequest);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        await expect(validateFilesExistSpy).rejects.toThrow();
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(0);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 500 status code and error message, isGpkgIndexExist access db error', async () => {
        const badValidateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };

        const response = await requestSender.validateGpkgs(badValidateGpkgsRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code and error message, getGrid access db error', async () => {
        const badValidateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };
        jest.spyOn(SQLiteClient.prototype, 'isGpkgIndexExist').mockReturnValue(true);

        const response = await requestSender.validateGpkgs(badValidateGpkgsRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code and error message, getGpkgTileSize access db error', async () => {
        const badValidateGpkgsRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };
        jest.spyOn(SQLiteClient.prototype, 'isGpkgIndexExist').mockReturnValue(true);
        jest.spyOn(SQLiteClient.prototype, 'getGrid').mockReturnValue(Grid.TWO_ON_ONE);

        const response = await requestSender.validateGpkgs(badValidateGpkgsRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });
});
