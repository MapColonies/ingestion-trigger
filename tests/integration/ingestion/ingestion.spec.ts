import { faker } from '@faker-js/faker';
import { OperationStatus, type ICreateJobResponse } from '@map-colonies/mc-priority-queue';
import { CORE_VALIDATIONS, getMapServingLayerName, RasterProductTypes } from '@map-colonies/raster-shared';
import { SqliteError } from 'better-sqlite3';
import gdal from 'gdal-async';
import httpStatusCodes from 'http-status-codes';
import { matches, merge, set, unset } from 'lodash';
import nock from 'nock';
import { randexp } from 'randexp';
import { getApp } from '../../../src/app';
import { Grid, type ResponseId, type ValidationTaskParameters } from '../../../src/ingestion/interfaces';
import { GpkgManager } from '../../../src/ingestion/models/gpkgManager';
import { infoDataSchemaArray } from '../../../src/ingestion/schemas/infoDataSchema';
import type { IngestionNewLayer } from '../../../src/ingestion/schemas/ingestionLayerSchema';
import type { IngestionUpdateLayer } from '../../../src/ingestion/schemas/updateLayerSchema';
import { SourceValidator } from '../../../src/ingestion/validators/sourceValidator';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import { Checksum } from '../../../src/utils/hash/checksum';
import { ZodValidator } from '../../../src/utils/validation/zodValidator';
import {
  createCatalogLayerResponse,
  createFindJobsParams,
  createNewJobRequest,
  createNewLayerRequest,
  createUpdateJobRequest,
  createUpdateLayerRequest,
  generateCallbackUrl,
  rasterLayerInputFilesGenerators,
  rasterLayerMetadataGenerators,
} from '../../mocks/mockFactory';
import type { DeepPartial, DeepRequired, FlattenKeyTupleUnion } from '../../utils/types';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';
import { IngestionRequestSender } from './helpers/ingestionRequestSender';

describe('Ingestion', function () {
  let requestSender: IngestionRequestSender;
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

  const jobManagerURL = 'http://jobmanagerurl';
  const mapProxyApiServiceUrl = 'http://mapproxyapiserviceurl';
  const catalogServiceURL = 'http://catalogserviceurl';
  let jobResponse: ICreateJobResponse;

  beforeEach(function () {
    const [app] = getApp({
      override: [...getTestContainerConfig()],
    });
    jobResponse = {
      id: faker.string.uuid(),
      taskIds: [faker.string.uuid()],
    };

    requestSender = new IngestionRequestSender(app);
  });

  afterEach(function () {
    resetContainer();
    jest.restoreAllMocks();
    nock.cleanAll();
  });

  describe('POST /ingestion/validate/gpkgs', function () {
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
        const validSources = validInputFiles.inputFiles.gpkgFilesPath;

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

  describe('POST /info/gpkgs', () => {
    describe('Happy Path', () => {
      it('should return 200 status code and sources info', async () => {
        const request = { gpkgFilesPath: validInputFiles.inputFiles.gpkgFilesPath };

        const response = await requestSender.getInfoData(request);

        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toHaveLength(request.gpkgFilesPath.length);
        expect(infoDataSchemaArray.safeParse(response.body).success).toBe(true);
      });
    });

    describe('Bad Path', () => {
      it('should return 400 status code and sources info - too many files', async () => {
        const request = { gpkgFilesPath: [...validInputFiles.inputFiles.gpkgFilesPath, ...validInputFiles.inputFiles.gpkgFilesPath] };

        const response = await requestSender.getInfoData(request);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });

      it('should return 404 status code and sources info', async () => {
        const sources = fakeIngestionSources.invalidSources.filesNotExist;

        const response = await requestSender.getInfoData(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });

      it('should return 200 status code and sources info', async () => {
        const sources = fakeIngestionSources.invalidSources.unsupportedCrs;

        const response = await requestSender.getInfoData(sources);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });
  });

  describe('POST /ingestion', () => {
    describe('Happy Path', () => {
      it('should return 200 status code', async () => {
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const newLayerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);
        const findJobsParams = createFindJobsParams({
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
        });
        const newJobRequest = createNewJobRequest({
          ingestionNewLayer: layerRequest,
          checksums: validInputFiles.checksums,
        });
        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL)
          .post('/jobs', matches(JSON.parse(JSON.stringify(newJobRequest))))
          .reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL)
          .post('/records/find', {
            metadata: {
              productId: layerRequest.metadata.productId,
              productType: layerRequest.metadata.productType,
            },
          })
          .reply(httpStatusCodes.OK, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(newLayerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);
        const expectedResponseBody: ResponseId = {
          jobId: jobResponse.id,
          taskId: jobResponse.taskIds[0],
        };

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toStrictEqual(expectedResponseBody);
      });
    });

    describe('Bad Path', () => {
      const badRequestBodyTestCases: {
        testCase: string;
        badNewLayerRequest: DeepPartial<IngestionNewLayer>;
        removeProperty?: FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>;
      }[] = [
        {
          testCase: 'req body is not an object',
          badNewLayerRequest: '' as DeepPartial<IngestionNewLayer>,
        },
        {
          testCase: 'inputFiles in req body is not set',
          badNewLayerRequest: createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles'],
        },
        {
          testCase: 'inputFiles in req body is not an object',
          badNewLayerRequest: merge(createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: '',
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not set',
          badNewLayerRequest: createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles', 'gpkgFilesPath'],
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not an array',
          badNewLayerRequest: merge(createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: { gpkgFilesPath: faker.string.alphanumeric({ length: { min: 1, max: 100 } }) },
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with items count not equal to 1',
          badNewLayerRequest: set(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['inputFiles', 'gpkgFilesPath'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            faker.helpers.arrayElement([
              [],
              faker.helpers.multiple(() => faker.string.alphanumeric({ length: { min: 1, max: 100 } }), {
                count: { min: 2, max: 10 },
              }),
            ])
          ),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { gpkgFilesPath: [false] } }
          ),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that does not match file pattern',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '],
            },
          }),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'productShapefilePath'],
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: false } }
          ),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body does not match file pattern',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: rasterLayerInputFilesGenerators.productShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'metadataShapefilePath'],
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: false } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body does not match file pattern',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: rasterLayerInputFilesGenerators.metadataShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata'],
        },
        {
          testCase: 'metadata in req body is not an object',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: '' as unknown as IngestionNewLayer['metadata'],
          }),
        },
        {
          testCase: 'classification in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { classification: false } }
          ),
        },
        {
          testCase: 'classification in metadata in req body does not match string pattern',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { classification: '00' } }
          ),
        },
        {
          testCase: 'productId in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'productId'],
        },
        {
          testCase: 'productId in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productId: false } }
          ),
        },
        {
          testCase: 'productId in metadata in req body does not match string pattern',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            {
              metadata: {
                productId: faker.helpers.arrayElement([
                  randexp('^[^A-Za-z]{1}[A-Za-z0-9_]{0,37}$'),
                  randexp('^[A-Za-z]{1}[A-Za-z0-9_]{37}$') + faker.string.alphanumeric(),
                ]),
              },
            }
          ),
        },
        {
          testCase: 'productName in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'productName'],
        },
        {
          testCase: 'productName in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productName: false } }
          ),
        },
        {
          testCase: 'productName in metadata in req body must have a length of at least 1',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productName: '' } }
          ),
        },
        {
          testCase: 'productType in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'productType'],
        },
        {
          testCase: 'productType in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productType: false } }
          ),
        },
        {
          testCase: 'productType in metadata in req body must be one of allowed raster product types',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productType: '' } }
          ),
        },
        {
          testCase: 'srs in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'srs'],
        },
        {
          testCase: 'srs in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srs: false } }
          ),
        },
        {
          testCase: 'srs in metadata in req body must be one of allowed srs values',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srs: '' } }
          ),
        },
        {
          testCase: 'srsName in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'srsName'],
        },
        {
          testCase: 'srsName in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srsName: false } }
          ),
        },
        {
          testCase: 'srsName in metadata in req body must be one of allowed srsName values',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srsName: '' } }
          ),
        },
        {
          testCase: 'transparency in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'transparency'],
        },
        {
          testCase: 'transparency in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { transparency: false } }
          ),
        },
        {
          testCase: 'transparency in metadata in req body must be one of allowed transparency values',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { transparency: '' } }
          ),
        },
        {
          testCase: 'region in metadata in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'region'],
        },
        {
          testCase: 'region in metadata in req body is not an array',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { region: false } }
          ),
        },
        {
          testCase: 'region in metadata in req body is an empty array',
          badNewLayerRequest: set(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['metadata', 'region'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            []
          ),
        },
        {
          testCase: 'region in metadata in req body is an array with a region of min length of 1',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { region: [...faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: { min: 1, max: 10 } }), ''] } }
          ),
        },
        {
          testCase: 'description in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { description: false } }
          ),
        },
        {
          testCase: 'scale in metadata in req body is not a number',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { scale: false } }
          ),
        },
        {
          testCase: 'producerName in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { producerName: false } }
          ),
        },
        {
          testCase: 'productSubType in metadata in req body is not a string',
          badNewLayerRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productSubType: false } }
          ),
        },
        {
          testCase: 'ingestionResolution in req body is not set',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['ingestionResolution'],
        },
        {
          testCase: 'ingestionResolution in req body is not a number',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: '' as unknown as number,
          }),
        },
        {
          testCase: 'ingestionResolution in req body is not in a range of valid values',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: faker.helpers.arrayElement([
              faker.number.float({ min: Number.MIN_SAFE_INTEGER, max: CORE_VALIDATIONS.resolutionDeg.min }),
              faker.number.float({ min: CORE_VALIDATIONS.resolutionDeg.max + Number.EPSILON, max: Number.MAX_SAFE_INTEGER }),
            ]),
          }),
        },
        {
          testCase: 'callbackUrls in req body is not an array',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: '' as unknown as string[],
          }),
        },
        {
          testCase: 'callbackUrls in req body is an empty array',
          badNewLayerRequest: set(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['callbackUrls'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            []
          ),
        },
        {
          testCase: 'callbackUrls in req body does not match url pattern',
          badNewLayerRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: [generateCallbackUrl() + ' '],
          }),
        },
      ];

      it.each(badRequestBodyTestCases)(
        'should return 400 status code when invalid input - $testCase',
        async ({ badNewLayerRequest, removeProperty }) => {
          const layerRequest = badNewLayerRequest as IngestionNewLayer;
          if (removeProperty) {
            unset(layerRequest, removeProperty);
          }

          const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

          const response = await requestSender.ingestNewLayer(layerRequest);

          expect(response).toSatisfyApiSpec();
          expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
          expect(scope.isDone()).toBe(false);
        }
      );

      it('should return 400 status code when product shapefile is not contained within gpkg extent', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'blueMarble',
          },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });
    });

    describe('Sad Path', () => {
      it('should return 422 status code when invalid gdal info', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: { gpkgFilesPath: ['invalidCrs-3857.gpkg'], metadataShapefilePath: 'validIndexed', productShapefilePath: 'validIndexed' },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 409 status code when the ingested layer is in MapProxy', async () => {
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const newLayerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(newLayerName)}`)
          .reply(httpStatusCodes.OK, []);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when failed to read sqlite file', async () => {
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
        jest.spyOn(SQLiteClient.prototype, 'getDB').mockImplementation(() => {
          throw new SqliteError('failed read sqlite file', 'SQLITE_ERROR');
        });
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when unexpected error from MapProxy occurs', async () => {
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const newLayerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(newLayerName)}`)
          .reply(httpStatusCodes.GATEWAY_TIMEOUT);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when failed to calculate checksum for input file', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'validIndexed',
          },
        });
        const newLayerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
        });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL)
          .post('/records/find', {
            metadata: {
              productId: layerRequest.metadata.productId,
              productType: layerRequest.metadata.productType,
            },
          })
          .reply(httpStatusCodes.OK, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(newLayerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);
        jest.spyOn(Checksum.prototype, 'calculate').mockRejectedValueOnce(new Error());

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when failed to create new init job', async () => {
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const newLayerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);

        const findJobsParams = createFindJobsParams({
          resourceId: layerRequest.metadata.productId,
          productType: layerRequest.metadata.productType,
        });

        const newJobRequest = createNewJobRequest({ ingestionNewLayer: layerRequest, checksums: validInputFiles.checksums });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post('/jobs', matches(newJobRequest)).reply(httpStatusCodes.GATEWAY_TIMEOUT);
        nock(catalogServiceURL)
          .post('/records/find', {
            metadata: {
              productId: layerRequest.metadata.productId,
              productType: layerRequest.metadata.productType,
            },
          })
          .reply(httpStatusCodes.OK, []);
        nock(mapProxyApiServiceUrl)
          .get(`/layer/${encodeURIComponent(newLayerName)}`)
          .reply(httpStatusCodes.NOT_FOUND);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });
    });
  });

  describe('PUT /ingestion/:id', () => {
    describe('Happy Path', () => {
      it('should return 200 status code with update request', async () => {
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles, callbackUrls: undefined });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);
        const findJobsParams = createFindJobsParams({
          resourceId: updatedLayerMetadata.productId,
          productType: updatedLayerMetadata.productType,
        });
        const updateJobRequest = createUpdateJobRequest({
          ingestionUpdateLayer: layerRequest,
          rasterLayerMetadata: updatedLayerMetadata,
          checksums: validInputFiles.checksums,
        });

        nock(jobManagerURL).post('/jobs/find', matches(findJobsParams)).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL)
          .post('/jobs', matches(JSON.parse(JSON.stringify(updateJobRequest))))
          .reply(httpStatusCodes.OK, jobResponse);
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
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const catalogLayerResponse = createCatalogLayerResponse({
          metadata: {
            classification: layerRequest.metadata.classification,
            productType: RasterProductTypes.RASTER_VECTOR_BEST,
            productSubType: 'testProductSubType',
          },
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
        nock(jobManagerURL)
          .post('/jobs', matches(JSON.parse(JSON.stringify(updateSwapJobRequest))))
          .reply(httpStatusCodes.OK, jobResponse);
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
        expect(response.body).toStrictEqual(expectedResponseBody);
      });
    });

    describe('Bad Path', () => {
      it('should return 400 status code when layer identifier in req params is not uuid v4', async () => {
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.updateLayer('not uuid', layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

      const badRequestBodyTestCases: {
        testCase: string;
        badUpdateLayerRequest: DeepPartial<IngestionUpdateLayer>;
        removeProperty?: FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>;
      }[] = [
        {
          testCase: 'req body is not an object',
          badUpdateLayerRequest: '' as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'inputFiles in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles'],
        },
        {
          testCase: 'inputFiles in req body is not an object',
          badUpdateLayerRequest: merge(createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: '',
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles', 'gpkgFilesPath'],
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not an array',
          badUpdateLayerRequest: merge(createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: { gpkgFilesPath: faker.string.alphanumeric({ length: { min: 1, max: 100 } }) },
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with items count not equal to 1',
          badUpdateLayerRequest: set(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['inputFiles', 'gpkgFilesPath'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            faker.helpers.arrayElement([
              [],
              faker.helpers.multiple(() => faker.string.alphanumeric({ length: { min: 1, max: 100 } }), {
                count: { min: 2, max: 10 },
              }),
            ])
          ),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that is not a string',
          badUpdateLayerRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { gpkgFilesPath: [false] } }
          ),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that does not match file pattern',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '],
            },
          }),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'productShapefilePath'],
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not a string',
          badUpdateLayerRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: false } }
          ),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body does not match file pattern',
          badUpdateLayerRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: rasterLayerInputFilesGenerators.productShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'metadataShapefilePath'],
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not a string',
          badUpdateLayerRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: false } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body does not match file pattern',
          badUpdateLayerRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: rasterLayerInputFilesGenerators.metadataShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadata in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata'],
        },
        {
          testCase: 'metadata in req body is not an object',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: '' as unknown as IngestionUpdateLayer['metadata'],
          }),
        },
        {
          testCase: 'classification in metadata in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'classification'],
        },
        {
          testCase: 'classification in metadata in req body is not a string',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: { classification: false as unknown as string },
          }),
        },
        {
          testCase: 'classification in metadata in req body does not match string pattern',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: { classification: '00' },
          }),
        },
        {
          testCase: 'ingestionResolution in req body is not set',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['ingestionResolution'],
        },
        {
          testCase: 'ingestionResolution in req body is not a number',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: '' as unknown as number,
          }),
        },
        {
          testCase: 'ingestionResolution in req body is not in a range of valid values',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: faker.helpers.arrayElement([
              faker.number.float({ min: Number.MIN_SAFE_INTEGER, max: CORE_VALIDATIONS.resolutionDeg.min }),
              faker.number.float({ min: CORE_VALIDATIONS.resolutionDeg.max + Number.EPSILON, max: Number.MAX_SAFE_INTEGER }),
            ]),
          }),
        },
        {
          testCase: 'callbackUrls in req body is not an array',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: '' as unknown as string[],
          }),
        },
        {
          testCase: 'callbackUrls in req body is an empty array',
          badUpdateLayerRequest: set(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['callbackUrls'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            []
          ),
        },
        {
          testCase: 'callbackUrls in req body does not match url pattern',
          badUpdateLayerRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: [faker.internet.url() + ' '],
          }),
        },
      ];

      it.each(badRequestBodyTestCases)(
        'should return 400 status code when invalid input - $testCase',
        async ({ badUpdateLayerRequest, removeProperty }) => {
          const layerRequest = badUpdateLayerRequest as IngestionUpdateLayer;
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

      it('should return 400 status code when product shapefile is not contained within gpkg extent', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'blueMarble',
          },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });
    });

    describe('Sad Path', () => {
      it('should return 409 status code when there is more than one layer in the catalog', async () => {
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'validIndexed',
            productShapefilePath: 'validIndexed',
          },
        });
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
        jest.spyOn(Checksum.prototype, 'calculate').mockRejectedValueOnce(new Error());

        const response = await requestSender.updateLayer(updatedLayerMetadata.id, layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 500 status code when failed to create update job', async () => {
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
