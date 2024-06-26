import httpStatusCodes from 'http-status-codes';
import { InputFiles } from '@map-colonies/mc-model-types';
import gdal from 'gdal-async';
import { SqliteError } from 'better-sqlite3';
import nock from 'nock';
import { getApp } from '../../../src/app';
import { infoDataSchemaArray } from '../../../src/ingestion/schemas/infoDataSchema';
import { SourceValidator } from '../../../src/ingestion/validators/sourceValidator';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import { ZodValidator } from '../../../src/utils/validation/zodValidator';
import { Grid } from '../../../src/ingestion/interfaces';
import { GpkgManager } from '../../../src/ingestion/models/gpkgManager';
import { fakeIngestionSources } from '../../mocks/sourcesRequestBody';
import { jobResponse, newJobRequest, newLayerRequest } from '../../mocks/newIngestionRequestMockData';
import { getMapServingLayerName } from '../../../src/utils/layerNameGenerator';
import { IngestionRequestSender } from './helpers/ingestionRequestSender';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';

describe('Ingestion', function () {
  let requestSender: IngestionRequestSender;

  beforeEach(function () {
    const [app] = getApp({
      override: [...getTestContainerConfig()],
      useChild: true,
    });

    requestSender = new IngestionRequestSender(app);
  });

  afterEach(function () {
    resetContainer();
    jest.restoreAllMocks();
  });

  describe('validateSources', function () {
    describe('Happy Path', function () {
      let validateFilesExistSpy: jest.SpyInstance;
      let validateGdalInfoSpy: jest.SpyInstance;
      let validateGpkgFilesSpy: jest.SpyInstance;

      beforeEach(function () {
        validateFilesExistSpy = jest.spyOn(SourceValidator.prototype, 'validateFilesExist');
        validateGdalInfoSpy = jest.spyOn(SourceValidator.prototype, 'validateGdalInfo');
        validateGpkgFilesSpy = jest.spyOn(SourceValidator.prototype, 'validateGpkgFiles');
      });

      afterEach(function () {
        validateFilesExistSpy.mockClear();
        validateGdalInfoSpy.mockClear();
        validateGpkgFilesSpy.mockClear();
      });

      it('should return 200 status code and sources is valid response', async function () {
        const validSources: InputFiles = fakeIngestionSources.validSources.validInputFiles;

        const response = await requestSender.validateSources(validSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', true);
        expect(response.body).toHaveProperty('message', 'Sources are valid');
      }, 400000000);

      it('should return 200 status code and sources invalid response - file does not exist', async function () {
        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.filesNotExist;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        await expect(validateFilesExistSpy).rejects.toThrow();
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(0);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - directory does not exist', async function () {
        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.directoryNotExist;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        await expect(validateFilesExistSpy).rejects.toThrow();
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(0);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - unsupported CRS', async function () {
        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.unsupportedCrs;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - unsupported pixel size', async function () {
        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.unsupportedPixelSize;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - failed to get gdal info gdal.infoAsync', async function () {
        jest.spyOn(gdal, 'infoAsync').mockRejectedValue(new Error('failed to read file'));

        const invalidSources: InputFiles = fakeIngestionSources.validSources.validInputFiles;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - failed to open gdal dataset gdal.openAsync', async function () {
        jest.spyOn(gdal, 'openAsync').mockRejectedValue(new Error('failed to read file'));

        const invalidSources: InputFiles = fakeIngestionSources.validSources.validInputFiles;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        await expect(validateGdalInfoSpy).rejects.toThrow();
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(0);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - gpkg index not exist', async function () {
        const validateGpkgIndexSpy = jest.spyOn(GpkgManager.prototype as unknown as { validateGpkgIndex: jest.Mock }, 'validateGpkgIndex');

        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.withoutGpkgIndex;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgIndexSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgIndexSpy).toThrow();
        expect(validateGpkgFilesSpy).toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - unsupported grid', async function () {
        const validateGpkgGridSpy = jest.spyOn(GpkgManager.prototype as unknown as { validateGpkgGrid: jest.Mock }, 'validateGpkgGrid');

        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.unsupportedGrid;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgGridSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgGridSpy).toThrow();
        expect(validateGpkgFilesSpy).toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 200 status code and sources invalid response - unsupported tile size', async function () {
        const validateTilesSizeSpy = jest.spyOn(GpkgManager.prototype as unknown as { validateTilesSize: jest.Mock }, 'validateTilesSize');

        const invalidSources: InputFiles = fakeIngestionSources.invalidSources.unsupportedTileWidthSize;
        const response = await requestSender.validateSources(invalidSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(validateTilesSizeSpy).toHaveBeenCalledTimes(1);
        expect(validateTilesSizeSpy).toThrow();
        expect(validateGpkgFilesSpy).toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', false);
        expect(response.body).toHaveProperty('message');
      });
    });

    describe('Bad Path', function () {
      let zodValidatorSpy: jest.SpyInstance;
      beforeEach(function () {
        zodValidatorSpy = jest.spyOn(ZodValidator.prototype, 'validate');
      });
      afterEach(function () {
        zodValidatorSpy.mockClear();
      });

      it('should return 400 status code and error message too many files', async function () {
        const invalidSources = fakeIngestionSources.invalidValidation.tooManyFiles;
        const response = await requestSender.validateSources(invalidSources);

        expect(zodValidatorSpy).toHaveBeenCalledTimes(1);
        await expect(zodValidatorSpy).rejects.toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(response.body).toHaveProperty('message', 'fileNames: Number of files should be 1');
      });

      it('should return 400 status code and error message not supported file', async function () {
        const invalidSources = fakeIngestionSources.invalidValidation.notGpkg;
        const response = await requestSender.validateSources(invalidSources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 status code and error message no files supplied', async function () {
        const invalidSources = fakeIngestionSources.invalidValidation.noFiles;
        const response = await requestSender.validateSources(invalidSources);

        expect(zodValidatorSpy).toHaveBeenCalledTimes(1);
        await expect(zodValidatorSpy).rejects.toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 status code and error message no directory supplied', async function () {
        const invalidSources = fakeIngestionSources.invalidValidation.noDirectory;
        const response = await requestSender.validateSources(invalidSources);

        expect(zodValidatorSpy).toHaveBeenCalledTimes(1);
        await expect(zodValidatorSpy).rejects.toThrow();
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(response.body).toHaveProperty('message');
      });
    });

    describe('Sad Path', function () {
      beforeEach(function () {
        jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
          throw new SqliteError('failed read sqlite file', 'SQLITE_ERROR');
        });
      });

      afterEach(function () {
        jest.restoreAllMocks();
      });

      it('should return 500 status code and error message, isGpkgIndexExist access db error', async function () {
        const sources = fakeIngestionSources.validSources.validInputFiles;

        const response = await requestSender.validateSources(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 500 status code and error message, getGrid access db error', async function () {
        const sources = fakeIngestionSources.validSources.validInputFiles;

        jest.spyOn(SQLiteClient.prototype, 'isGpkgIndexExist').mockReturnValue(true);

        const response = await requestSender.validateSources(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 500 status code and error message, getGpkgTileSize access db error', async function () {
        const sources = fakeIngestionSources.validSources.validInputFiles;

        jest.spyOn(SQLiteClient.prototype, 'isGpkgIndexExist').mockReturnValue(true);
        jest.spyOn(SQLiteClient.prototype, 'getGrid').mockReturnValue(Grid.TWO_ON_ONE);

        const response = await requestSender.validateSources(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message');
      });
    });
  });

  describe('Ingestion Sources Info', () => {
    describe('Happy Path', () => {
      it('should return 200 status code and sources info', async () => {
        const sources = fakeIngestionSources.validSources.validInputFiles;
        const response = await requestSender.getSourcesGdalInfo(sources);

        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveLength(sources.fileNames.length);
        expect(infoDataSchemaArray.safeParse(response.body).success).toBe(true);
      });
    });

    describe('Bad Path', () => {
      it('should return 400 status code and sources info', async () => {
        const sources = fakeIngestionSources.invalidValidation.tooManyFiles;

        const response = await requestSender.getSourcesGdalInfo(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 404 status code and sources info', async () => {
        const sources = fakeIngestionSources.invalidSources.filesNotExist;

        const response = await requestSender.getSourcesGdalInfo(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 200 status code and sources info', async () => {
        const sources = fakeIngestionSources.invalidSources.unsupportedCrs;

        const response = await requestSender.getSourcesGdalInfo(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });
  });

  describe('Ingestion Validation', () => {
    const jobManagerURL = 'http://jobmanagerurl';
    const mapProxyApiServiceUrl = 'http://mapproxyapiserviceurl';
    const catalogServiceURL = 'http://catalogserviceurl';
    let layerName = '';
    let catalogPostBody = {};

    beforeEach(() => {
      layerName = getMapServingLayerName(newLayerRequest.valid.metadata.productId, newLayerRequest.valid.metadata.productType);
      catalogPostBody = {
        metadata: { productId: newLayerRequest.valid.metadata.productId, productType: newLayerRequest.valid.metadata.productType },
      };
    });

    describe('Happy Path', () => {
      it('should return 200 status code', async () => {
        const layerRequest = newLayerRequest.valid;
        const getJobsParams = {
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
        };
        nock(jobManagerURL).get('/jobs').query(getJobsParams).reply(200, []);
        nock(jobManagerURL).post('/jobs', newJobRequest).reply(200, jobResponse);
        nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(200, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(404);

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });
    describe('Bad Path', () => {
      it('should return 400 status code when the validation of the metadata fails', async () => {
        const layerRequest = newLayerRequest.invalid.metadata;

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData geometry isnt a valid geometry', async () => {
        const layerRequest = newLayerRequest.invalid.invalidBeginDate;

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData BeginTime is after EndTime', async () => {
        const layerRequest = newLayerRequest.invalid.invalidPartDataGeometry;

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData BeginTime is after currentTime', async () => {
        const layerRequest = newLayerRequest.invalid.invalidBeginDateAfterCurrent;

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData EndTime is after currentTime', async () => {
        const layerRequest = newLayerRequest.invalid.invalidEndDateAfterCurrent;

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData geometry type is wrong', async () => {
        const layerRequest = newLayerRequest.invalid.invalidGeometryType;

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData polygon geometry isnt contained by extent', async () => {
        const layerRequest = newLayerRequest.invalid.notContainedPolygon;
        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData resolutionDeg isnt greater than pixel size ', async () => {
        const layerRequest = newLayerRequest.invalid.invalidResolutionDeg;
        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partData MultiPolygon geometry isnt contained by extent', async () => {
        const layerRequest = newLayerRequest.invalid.notContainedMultiPolygon;
        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should throw 409 status when the ingested layer is in mapProxy', async () => {
        const layerRequest = newLayerRequest.valid;

        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(200, []);
        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should throw 422 status when invalid gdal info', async () => {
        const layerRequest = newLayerRequest.invalid.gdalInfo;

        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(200, []);
        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
      });
    });
    describe('Sad Path', () => {
      beforeEach(() => {});

      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 500 status code when failed to read sqlite file', async () => {
        const layerRequest = newLayerRequest.valid;
        jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
          throw new SqliteError('failed read sqlite file', 'SQLITE_ERROR');
        });

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code when failed to create new init job', async () => {
        const layerRequest = newLayerRequest.valid;

        const getJobsParams = {
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
        };
        nock(jobManagerURL).get('/jobs').query(getJobsParams).reply(200, []);
        nock(jobManagerURL).post('/jobs', newJobRequest).reply(504);
        nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(200, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(404);

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code when unexpected error from mapproxy occurs', async () => {
        const layerRequest = newLayerRequest.valid;

        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(504);

        const response = await requestSender.validateIngestion(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });
});
