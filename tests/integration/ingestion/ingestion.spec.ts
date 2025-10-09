import type { InputFiles } from '@map-colonies/mc-model-types';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { getMapServingLayerName } from '@map-colonies/raster-shared';
import { SqliteError } from 'better-sqlite3';
import gdal from 'gdal-async';
import httpStatusCodes from 'http-status-codes';
import nock from 'nock';
import { getApp } from '../../../src/app';
import { Grid } from '../../../src/ingestion/interfaces';
import { GpkgManager } from '../../../src/ingestion/models/gpkgManager';
import { infoDataSchemaArray } from '../../../src/ingestion/schemas/infoDataSchema';
import { SourceValidator } from '../../../src/ingestion/validators/sourceValidator';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import { ZodValidator } from '../../../src/utils/validation/zodValidator';
import { invalidNewLayerRequest, jobResponse, newJobRequest, validNewLayerRequest } from '../../mocks/newIngestionRequestMockData';
import { fakeIngestionSources } from '../../mocks/sourcesRequestBody';
import {
  updateJobRequest,
  invalidUpdateLayerRequest,
  updateRunningJobResponse,
  updateSwapJobRequest,
  updatedLayer,
  updatedSwapLayer,
  validUpdateLayerRequest,
} from '../../mocks/updateRequestMockData';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';
import { IngestionRequestSender } from './helpers/ingestionRequestSender';

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

  describe('POST /ingestion/validateSources', function () {
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
        // TODO: change interface!!!
        const validSources: InputFiles = fakeIngestionSources.validSources.validInputFiles;

        const response = await requestSender.validateSources(validSources);

        expect(validateFilesExistSpy).toHaveBeenCalledTimes(1);
        expect(validateGdalInfoSpy).toHaveBeenCalledTimes(1);
        expect(validateGpkgFilesSpy).toHaveBeenCalledTimes(1);
        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveProperty('isValid', true);
        expect(response.body).toHaveProperty('message', 'Sources are valid');
      });

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

  describe('POST /ingestion/sourcesInfo', () => {
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

  describe('POST /ingestion', () => {
    // TODO: work with the config lib, not parallel to it
    const jobManagerURL = 'http://jobmanagerurl';
    const mapProxyApiServiceUrl = 'http://mapproxyapiserviceurl';
    const catalogServiceURL = 'http://catalogserviceurl';
    const layerName = getMapServingLayerName(validNewLayerRequest.valid.metadata.productId, validNewLayerRequest.valid.metadata.productType);
    const catalogPostBody = {
      metadata: { productId: validNewLayerRequest.valid.metadata.productId, productType: validNewLayerRequest.valid.metadata.productType },
    };

    describe('Happy Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });
      it('should return 200 status code', async () => {
        const layerRequest = validNewLayerRequest.valid;
        const getJobsParams = {
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
        };
        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', newJobRequest).reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(httpStatusCodes.OK, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });

    describe('Bad Path', () => {
      it('should return 400 status code when the validation of the metadata fails', async () => {
        const layerRequest = invalidNewLayerRequest.metadata;

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 400 status code when partsData polygon geometry is not contained by extent', async () => {
        const layerRequest = invalidNewLayerRequest.notContainedPolygon;
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should throw 409 status when the ingested layer is in mapProxy', async () => {
        const layerRequest = validNewLayerRequest.valid;

        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(httpStatusCodes.OK, []);
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should throw 422 status when invalid gdal info', async () => {
        const layerRequest = invalidNewLayerRequest.gdalInfo;

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
      });
    });

    describe('Sad Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 500 status code when failed to read sqlite file', async () => {
        const layerRequest = validNewLayerRequest.valid;
        jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
          throw new SqliteError('failed read sqlite file', 'SQLITE_ERROR');
        });

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code when failed to create new init job', async () => {
        const layerRequest = validNewLayerRequest.valid;

        const getJobsParams = {
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
        };
        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', newJobRequest).reply(httpStatusCodes.GATEWAY_TIMEOUT);
        nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(httpStatusCodes.OK, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code when unexpected error from mapproxy occurs', async () => {
        const layerRequest = validNewLayerRequest.valid;

        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(httpStatusCodes.GATEWAY_TIMEOUT);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });

  describe('PUT /ingestion/:id', () => {
    const jobManagerURL = 'http://jobmanagerurl';
    const mapProxyApiServiceUrl = 'http://mapproxyapiserviceurl';
    const catalogServiceURL = 'http://catalogserviceurl';
    const forbiddenJobTypesForParallelIngestion = ['Ingestion_New', 'Ingestion_Update'];

    describe('Happy Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 200 status code with update request', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const getJobsParams = {
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
          types: forbiddenJobTypesForParallelIngestion,
        };

        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', updateJobRequest).reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });

      it('should return 200 status code with swap update request', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedSwapLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const getJobsParams = {
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
          types: forbiddenJobTypesForParallelIngestion,
        };

        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', updateSwapJobRequest).reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedSwapLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });

    describe('Bad Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 400 status code when the validation of the metadata fails', async () => {
        const layerRequest = invalidUpdateLayerRequest.metadata;

        const response = await requestSender.updateLayer('14460cdd-44ae-4a04-944f-29e907b6cd2a', layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 409 status code when there is more than one layer in the catalog', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;

        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer, updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should return 404 status code when there is no such layer in the catalog', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;

        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, []);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 400 status code when there is a validation error', async () => {
        const layerRequest = invalidUpdateLayerRequest.notContainedPolygon;
        const updatedLayerMetadata = updatedLayer.metadata;

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 404 status code when the layer is not in mapProxy', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 409 status code when there are conflicting jobs', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const getJobsParams = {
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
          types: forbiddenJobTypesForParallelIngestion,
        };

        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, updateRunningJobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should throw 422 status when invalid gdal info', async () => {
        const layerRequest = invalidUpdateLayerRequest.gdalInfo;

        const response = await requestSender.updateLayer('14460cdd-44ae-4a04-944f-29e907b6cd2a', layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
      });
    });

    describe('Sad Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 500 status code when failed to read sqlite file', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;
        jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
          throw new SqliteError('failed read sqlite file', 'SQLITE_ERROR');
        });

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code when failed to create new init update job', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const getJobsParams = {
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
          types: forbiddenJobTypesForParallelIngestion,
        };

        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', updateJobRequest).reply(httpStatusCodes.GATEWAY_TIMEOUT);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 status code when unexpected error from mapproxy occurs', async () => {
        const layerRequest = validUpdateLayerRequest.valid;
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const getJobsParams = {
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
          isCleaned: false,
          shouldReturnTasks: false,
          statuses: [OperationStatus.PENDING, OperationStatus.IN_PROGRESS],
          types: forbiddenJobTypesForParallelIngestion,
        };

        nock(jobManagerURL).post('/jobs/find', getJobsParams).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', updateJobRequest).reply(httpStatusCodes.GATEWAY_TIMEOUT);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.INTERNAL_SERVER_ERROR);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });
});
