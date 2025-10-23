import { faker } from '@faker-js/faker';
import { OperationStatus } from '@map-colonies/mc-priority-queue';
import { CORE_VALIDATIONS, getMapServingLayerName } from '@map-colonies/raster-shared';
import { SqliteError } from 'better-sqlite3';
import gdal from 'gdal-async';
import httpStatusCodes from 'http-status-codes';
import { matches, unset } from 'lodash';
import nock from 'nock';
import { getApp } from '../../../src/app';
import { Grid, type ResponseId, type ValidationTaskParameters } from '../../../src/ingestion/interfaces';
import { GpkgManager } from '../../../src/ingestion/models/gpkgManager';
import { infoDataSchemaArray } from '../../../src/ingestion/schemas/infoDataSchema';
import type { IngestionUpdateLayer } from '../../../src/ingestion/schemas/updateLayerSchema';
import { SourceValidator } from '../../../src/ingestion/validators/sourceValidator';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import { ZodValidator } from '../../../src/utils/validation/zodValidator';
import {
  createCatalogLayerResponse,
  createFindJobsParams,
  createUpdateJobRequest,
  createUpdateLayerRequest,
  rasterLayerInputFilesGenerators,
  rasterLayerMetadataGenerators,
} from '../../mocks/mockFactory';
import { invalidNewLayerRequest, jobResponse, newJobRequest, validNewLayerRequest } from '../../mocks/newIngestionRequestMockData';
import { fakeIngestionSources } from '../../mocks/sourcesRequestBody';
import type { DeepPartial } from '../../utils/types';
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
        const validSources = fakeIngestionSources.validSources.validInputFiles;

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
        const invalidSources = fakeIngestionSources.invalidSources.filesNotExist;
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
        const invalidSources = fakeIngestionSources.invalidSources.directoryNotExist;
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
        const invalidSources = fakeIngestionSources.invalidSources.unsupportedCrs;
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
        const invalidSources = fakeIngestionSources.invalidSources.unsupportedPixelSize;
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

        const invalidSources = fakeIngestionSources.validSources.validInputFiles;
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

        const invalidSources = fakeIngestionSources.validSources.validInputFiles;
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

        const invalidSources = fakeIngestionSources.invalidSources.withoutGpkgIndex;
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

        const invalidSources = fakeIngestionSources.invalidSources.unsupportedGrid;
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

        const invalidSources = fakeIngestionSources.invalidSources.unsupportedTileWidthSize;
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
    // at least use configMock.get() to get the following values
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
        const findJobsParams = createFindJobsParams({
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
        });
        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', newJobRequest).reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', catalogPostBody).reply(httpStatusCodes.OK, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);
        const expectedResponseBody: ResponseId = {
          jobId: jobResponse.id,
          taskId: jobResponse.taskIds[0],
        };

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toBe(expectedResponseBody);
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

      it('should return 409 status when the ingested layer is in mapProxy', async () => {
        const layerRequest = validNewLayerRequest.valid;

        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(layerName)}`)
          .reply(httpStatusCodes.OK, []);
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should return 422 status code when invalid gdal info', async () => {
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

        const findJobsParams = createFindJobsParams({
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
        });
        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
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
    const validInputFiles: Pick<ValidationTaskParameters, 'checksums'> & Pick<IngestionUpdateLayer, 'inputFiles'> = {
      inputFiles: {
        gpkgFilesPath: ['validIndexed.gpkg'],
        productShapefilePath: 'validIndexed',
        metadataShapefilePath: 'validIndexed',
      },
      checksums: [
        { algorithm: 'XXH64', checksum: 'a0915c78be995614', fileName: 'testFiles/metadata/validIndexed/ShapeMetadata.cpg' },
        { algorithm: 'XXH64', checksum: '1c4047022f216b6f', fileName: 'testFiles/metadata/validIndexed/ShapeMetadata.dbf' },
        { algorithm: 'XXH64', checksum: '691fb87c5aeebb48', fileName: 'testFiles/metadata/validIndexed/ShapeMetadata.prj' },
        { algorithm: 'XXH64', checksum: '5e371a633204f7eb', fileName: 'testFiles/metadata/validIndexed/ShapeMetadata.shp' },
        { algorithm: 'XXH64', checksum: '89abcaac2015beff', fileName: 'testFiles/metadata/validIndexed/ShapeMetadata.shx' },
      ],
    };

    // TODO: order this links
    const jobManagerURL = 'http://jobmanagerurl';
    const mapProxyApiServiceUrl = 'http://mapproxyapiserviceurl';
    const catalogServiceURL = 'http://catalogserviceurl';

    describe('Happy Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 200 status code with update request', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });
        const rasterLayerMetadata = createCatalogLayerResponse({ metadata: updatedLayerMetadata }).metadata;
        const updateJobRequest = createUpdateJobRequest({
          ingestionUpdateLayer: layerRequest,
          rasterLayerMetadata,
          checksums: validInputFiles.checksums,
        });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', matches(updateJobRequest)).reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);
        const expectedResponseBody: ResponseId = {
          jobId: jobResponse.id,
          taskId: jobResponse.taskIds[0],
        };

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toStrictEqual(expectedResponseBody);
      });

      it('should return 200 status code with swap update request', async () => {
        const layerRequest = createUpdateLayerRequest({ ...validInputFiles });
        const catalogLayerResponse = createCatalogLayerResponse({
          metadata: { classification: layerRequest.metadata.classification, productSubType: 'testProductSubType' },
        });
        const updatedLayerMetadata = catalogLayerResponse.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });

        const updateSwapJobRequest = createUpdateJobRequest(
          { ingestionUpdateLayer: layerRequest, rasterLayerMetadata: updatedLayerMetadata, checksums: validInputFiles.checksums },
          true
        );

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', matches(updateSwapJobRequest)).reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [catalogLayerResponse]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);
        const expectedResponseBody: ResponseId = {
          jobId: jobResponse.id,
          taskId: jobResponse.taskIds[0],
        };

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toBe(expectedResponseBody);
      });
    });

    describe('Bad Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 400 status code when layer identifier in req params is not uuid v4', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.updateLayer('not uuid', layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

      const badRequestBodyTestCases = [
        {
          testCase: 'req body is not an object',
          badUpdateLayerRequest: '' as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'inputFiles in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['inputFiles'],
        },
        {
          testCase: 'inputFiles in req body is not an object',
          badUpdateLayerRequest: { inputFiles: '' } as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['inputFiles', 'gpkgFilesPath'],
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not an array',
          badUpdateLayerRequest: {
            inputFiles: { ...validInputFiles.inputFiles, gpkgFilesPath: faker.string.alphanumeric({ length: { min: 1, max: 100 } }) },
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with items count not equal to 1',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: faker.helpers.arrayElement([
                [],
                faker.helpers.multiple(() => faker.string.alphanumeric({ length: { min: 1, max: 100 } }), {
                  count: { min: 2, max: 10 },
                }),
              ]),
            },
          },
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that is not a string',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [false],
            },
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that does not match file pattern',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '],
            },
          },
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that does not match file pattern',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '],
            },
          },
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['inputFiles', 'productShapefilePath'],
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not a string',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              productShapefilePath: false,
            },
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body does not match file pattern',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              productShapefilePath: rasterLayerInputFilesGenerators.productShapefilePath() + ' ',
            },
          },
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['inputFiles', 'metadataShapefilePath'],
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not a string',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              metadataShapefilePath: false,
            },
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body does not match file pattern',
          badUpdateLayerRequest: {
            inputFiles: {
              ...validInputFiles.inputFiles,
              metadataShapefilePath: rasterLayerInputFilesGenerators.metadataShapefilePath() + ' ',
            },
          },
        },
        {
          testCase: 'metadata in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['metadata'],
        },
        {
          testCase: 'metadata in req body is not an object',
          badUpdateLayerRequest: {
            metadata: '',
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'classification in metadata in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['metadata', 'classification'],
        },
        {
          testCase: 'classification in metadata in req body is not a string',
          badUpdateLayerRequest: {
            metadata: { classification: false },
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'classification in metadata in req body does not match string pattern',
          badUpdateLayerRequest: {
            metadata: { classification: '00' },
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'ingestionResolution in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['ingestionResolution'],
        },
        {
          testCase: 'ingestionResolution in req body is not a number',
          badUpdateLayerRequest: { ingestionResolution: '' } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'ingestionResolution in req body is not in a range of valid values',
          badUpdateLayerRequest: {
            ingestionResolution: faker.helpers.arrayElement([
              faker.number.float({ min: Number.MIN_SAFE_INTEGER, max: CORE_VALIDATIONS.resolutionDeg.min }),
              faker.number.float({ min: CORE_VALIDATIONS.resolutionDeg.max + Number.EPSILON, max: Number.MAX_SAFE_INTEGER }),
            ]),
          },
        },
        {
          testCase: 'callbackUrls in req body is not set',
          badUpdateLayerRequest: {},
          removeProperty: ['callbackUrls'],
        },
        {
          testCase: 'callbackUrls in req body is not an array',
          badUpdateLayerRequest: {
            callbackUrls: '',
          } as unknown as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'callbackUrls in req body is an empty array',
          badUpdateLayerRequest: {
            callbackUrls: [],
          },
        },
        {
          testCase: 'callbackUrls in req body does not match url pattern',
          badUpdateLayerRequest: {
            callbackUrls: [faker.internet.url() + ' '],
          },
        },
      ] satisfies {
        testCase: string;
        badUpdateLayerRequest: DeepPartial<IngestionUpdateLayer>;
        removeProperty?: string[];
      }[];

      it.each(badRequestBodyTestCases)(
        'should return 400 status code when invalid input - $testCase',
        async ({ badUpdateLayerRequest, removeProperty }) => {
          const layerRequest = createUpdateLayerRequest({
            ...validInputFiles,
            ...(badUpdateLayerRequest as unknown as Parameters<typeof createUpdateLayerRequest>[0]),
          });
          if (removeProperty) {
            unset(layerRequest, removeProperty);
          }
          const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

          const response = await requestSender.updateLayer(rasterLayerMetadataGenerators.id(), layerRequest);

          expect(response).toSatisfyApiSpec();
          expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
          expect(scope.isDone()).toBe(false);
        }
      );

      it('should return 400 status code when product shapefile is contained within gpkg extent', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'blueMarble',
          },
        });
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.updateLayer(rasterLayerMetadataGenerators.id(), layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });
    });

    describe('Sad Path', () => {
      afterEach(() => {
        jest.restoreAllMocks();
        nock.cleanAll();
      });

      it('should return 409 status code when there is more than one layer in the catalog', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer, updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 404 status code when there is no such layer in the catalog', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, []);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 404 status code when the layer is not in MapProxy', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 409 status code when there are conflicting jobs', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });
        const updateRunningJobResponse = {
          status: faker.helpers.arrayElement([
            OperationStatus.PENDING,
            OperationStatus.IN_PROGRESS,
            OperationStatus.FAILED,
            OperationStatus.SUSPENDED,
          ]),
          type: 'Ingestion_New',
        };

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, updateRunningJobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
        expect(scope.isDone()).toBe(false);
      });

      const fileMissingTestCases: ({ case: string } & Pick<IngestionUpdateLayer, 'inputFiles'>)[] = [
        {
          case: 'gpkg',
          inputFiles: { ...validInputFiles.inputFiles, gpkgFilesPath: ['not-existing-file.gpkg'] },
        },
        {
          case: 'Prodcut.cpg',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingCpg' },
        },
        {
          case: 'Prodcut.dbf',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingDbf' },
        },
        {
          case: 'Prodcut.prj',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingPrj' },
        },
        {
          case: 'Prodcut.shp',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingShp' },
        },
        {
          case: 'Prodcut.shx',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingShx' },
        },
        {
          case: 'ShapeMetadata.cpg',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingCpg' },
        },
        {
          case: 'ShapeMetadata.dbf',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingDbf' },
        },
        {
          case: 'ShapeMetadata.prj',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingPrj' },
        },
        {
          case: 'ShapeMetadata.shp',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingShp' },
        },
        {
          case: 'ShapeMetadata.shx',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingShx' },
        },
      ];
      it.each(fileMissingTestCases)('should return 422 status code when file does not exist - $case', async ({ inputFiles }) => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles,
        });
        const catalogLayerResponse = createCatalogLayerResponse({
          metadata: { classification: layerRequest.metadata.classification },
        });
        const updatedLayerMetadata = catalogLayerResponse.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [catalogLayerResponse]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when invalid gdal info', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: { gpkgFilesPath: ['invalidCrs-3857.gpkg'], metadataShapefilePath: 'validIndexed', productShapefilePath: 'validIndexed' },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when gpkg is invalid gpkg', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: { gpkgFilesPath: ['invalid.gpkg'], metadataShapefilePath: 'validIndexed', productShapefilePath: 'validIndexed' },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when gpkg index is missing', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: { gpkgFilesPath: ['withoutGpkgIndex.gpkg'], metadataShapefilePath: 'validIndexed', productShapefilePath: 'validIndexed' },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when gpkg grid is not a supported tile matrix grid', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: { gpkgFilesPath: ['unsupportedGridMatrix.gpkg'], metadataShapefilePath: 'validIndexed', productShapefilePath: 'validIndexed' },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when gpkg tile height size is not supported', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['unsupportedTileSize-height-512.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'validIndexed',
          },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when gpkg tile width size is not supported', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['unsupportedTileSize-width-512.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'validIndexed',
          },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when unexpected error from MapProxy occurs', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.INTERNAL_SERVER_ERROR);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when failed to calculate checksum for input file', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when failed to create update job', async () => {
        const layerRequest = createUpdateLayerRequest(validInputFiles);
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });

        const rasterLayerMetadata = createCatalogLayerResponse({ metadata: updatedLayerMetadata }).metadata;
        const updateJobRequest = createUpdateJobRequest({
          ingestionUpdateLayer: layerRequest,
          rasterLayerMetadata,
          checksums: validInputFiles.checksums,
        });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', matches(updateJobRequest)).reply(httpStatusCodes.GATEWAY_TIMEOUT);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(updateLayerName)}`)
          .reply(httpStatusCodes.OK);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });
});
