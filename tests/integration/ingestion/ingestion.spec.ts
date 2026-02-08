import fs from 'node:fs';
import { faker } from '@faker-js/faker';
import { IJobResponse, OperationStatus, type ICreateJobResponse } from '@map-colonies/mc-priority-queue';
import { CORE_VALIDATIONS, getMapServingLayerName, RasterProductTypes } from '@map-colonies/raster-shared';
import { SqliteError } from 'better-sqlite3';
import httpStatusCodes from 'http-status-codes';
import { matches, merge, set, unset } from 'lodash';
import nock from 'nock';
import { randexp } from 'randexp';
import { getApp } from '../../../src/app';
import { type ResponseId } from '../../../src/ingestion/interfaces';
import type { IngestionNewLayer } from '../../../src/ingestion/schemas/newLayerSchema';
import type { IngestionUpdateLayer } from '../../../src/ingestion/schemas/updateLayerSchema';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import { Checksum } from '../../../src/utils/hash/checksum';
import { configMock } from '../../mocks/configMock';
import {
  createCatalogLayerResponse,
  createFindJobsParams,
  createNewJobRequest,
  createNewLayerRequest,
  createUpdateJobRequest,
  createUpdateLayerRequest,
  generateCallbackUrl,
  generateMockJob,
  rasterLayerInputFilesGenerators,
  rasterLayerMetadataGenerators,
} from '../../mocks/mockFactory';
import { validInputFiles } from '../../mocks/static/exampleData';
import type { DeepPartial, DeepRequired, FlattenKeyTupleUnion } from '../../utils/types';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';
import { IngestionRequestSender } from './helpers/ingestionRequestSender';

describe('Ingestion', () => {
  let jobManagerURL: string;
  let mapProxyApiServiceUrl: string;
  let catalogServiceURL: string;
  let polygonPartsManagerURL: string;
  let jobResponse: ICreateJobResponse;
  let requestSender: IngestionRequestSender;

  beforeEach(() => {
    const [app] = getApp({
      override: [...getTestContainerConfig()],
    });
    jobResponse = {
      id: faker.string.uuid(),
      taskIds: [faker.string.uuid()],
    };

    jobManagerURL = configMock.get<string>('services.jobManagerURL');
    mapProxyApiServiceUrl = configMock.get<string>('services.mapProxyApiServiceUrl');
    catalogServiceURL = configMock.get<string>('services.catalogServiceURL');
    polygonPartsManagerURL = configMock.get<string>('services.polygonPartsManagerURL');

    requestSender = new IngestionRequestSender(app);
  });

  afterEach(() => {
    resetContainer();
    jest.restoreAllMocks();
    nock.cleanAll();
  });

  describe('POST /ingestion', () => {
    describe('Happy Path', () => {
      it('should return 200 status code when product shapefile is polygon', async () => {
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

      it('should return 200 status code when product shapefile is multipolygon', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'validIndexedMultiPolygon' },
        });
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
        badRequest: DeepPartial<IngestionNewLayer>;
        removeProperty?: FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>;
      }[] = [
        {
          testCase: 'req body is not an object',
          badRequest: '' as DeepPartial<IngestionNewLayer>,
        },
        {
          testCase: 'inputFiles in req body is not set',
          badRequest: createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles'],
        },
        {
          testCase: 'inputFiles in req body is not an object',
          badRequest: merge(createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: '',
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not set',
          badRequest: createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles', 'gpkgFilesPath'],
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not an array',
          badRequest: merge(createNewLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: { gpkgFilesPath: faker.string.alphanumeric({ length: { min: 1, max: 100 } }) },
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with items count not equal to 1',
          badRequest: set(
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
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { gpkgFilesPath: [false] } }
          ),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that does not match file pattern',
          badRequest: createNewLayerRequest({
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '],
            },
          }),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'productShapefilePath'],
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: false } }
          ),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body does not match file pattern',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: rasterLayerInputFilesGenerators.productShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'metadataShapefilePath'],
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: false } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body does not match file pattern',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: rasterLayerInputFilesGenerators.metadataShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata'],
        },
        {
          testCase: 'metadata in req body is not an object',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: '' as unknown as IngestionNewLayer['metadata'],
          }),
        },
        {
          testCase: 'classification in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { classification: false } }
          ),
        },
        {
          testCase: 'classification in metadata in req body does not match string pattern',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { classification: '00' } }
          ),
        },
        {
          testCase: 'productId in metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'productId'],
        },
        {
          testCase: 'productId in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productId: false } }
          ),
        },
        {
          testCase: 'productId in metadata in req body does not match string pattern',
          badRequest: merge(
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
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'productName'],
        },
        {
          testCase: 'productName in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productName: false } }
          ),
        },
        {
          testCase: 'productName in metadata in req body must have a length of at least 1',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productName: '' } }
          ),
        },
        {
          testCase: 'productType in metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'productType'],
        },
        {
          testCase: 'productType in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productType: false } }
          ),
        },
        {
          testCase: 'productType in metadata in req body must be one of allowed raster product types',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productType: '' } }
          ),
        },
        {
          testCase: 'srs in metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'srs'],
        },
        {
          testCase: 'srs in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srs: false } }
          ),
        },
        {
          testCase: 'srs in metadata in req body must be one of allowed srs values',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srs: '' } }
          ),
        },
        {
          testCase: 'srsName in metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'srsName'],
        },
        {
          testCase: 'srsName in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srsName: false } }
          ),
        },
        {
          testCase: 'srsName in metadata in req body must be one of allowed srsName values',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { srsName: '' } }
          ),
        },
        {
          testCase: 'transparency in metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'transparency'],
        },
        {
          testCase: 'transparency in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { transparency: false } }
          ),
        },
        {
          testCase: 'transparency in metadata in req body must be one of allowed transparency values',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { transparency: '' } }
          ),
        },
        {
          testCase: 'region in metadata in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'region'],
        },
        {
          testCase: 'region in metadata in req body is not an array',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { region: false } }
          ),
        },
        {
          testCase: 'region in metadata in req body is an empty array',
          badRequest: set(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['metadata', 'region'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            []
          ),
        },
        {
          testCase: 'region in metadata in req body is an array with a region of min length of 1',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { region: [...faker.helpers.multiple(() => rasterLayerMetadataGenerators.region(), { count: { min: 1, max: 10 } }), ''] } }
          ),
        },
        {
          testCase: 'description in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { description: false } }
          ),
        },
        {
          testCase: 'scale in metadata in req body is not a number',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { scale: false } }
          ),
        },
        {
          testCase: 'producerName in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { producerName: false } }
          ),
        },
        {
          testCase: 'productSubType in metadata in req body is not a string',
          badRequest: merge(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { metadata: { productSubType: false } }
          ),
        },
        {
          testCase: 'ingestionResolution in req body is not set',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['ingestionResolution'],
        },
        {
          testCase: 'ingestionResolution in req body is not a number',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: '' as unknown as number,
          }),
        },
        {
          testCase: 'ingestionResolution in req body is not in a range of valid values',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: faker.helpers.arrayElement([
              faker.number.float({ min: Number.MIN_SAFE_INTEGER, max: CORE_VALIDATIONS.resolutionDeg.min }),
              faker.number.float({ min: CORE_VALIDATIONS.resolutionDeg.max + Number.EPSILON, max: Number.MAX_SAFE_INTEGER }),
            ]),
          }),
        },
        {
          testCase: 'callbackUrls in req body is not an array',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: '' as unknown as string[],
          }),
        },
        {
          testCase: 'callbackUrls in req body is an empty array',
          badRequest: set(
            createNewLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['callbackUrls'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            []
          ),
        },
        {
          testCase: 'callbackUrls in req body does not match url pattern',
          badRequest: createNewLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: [generateCallbackUrl() + ' '],
          }),
        },
      ];

      it.each(badRequestBodyTestCases)('should return 400 status code when invalid input - $testCase', async ({ badRequest, removeProperty }) => {
        if (removeProperty) {
          unset(badRequest, removeProperty);
        }

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.ingestNewLayer(badRequest as IngestionNewLayer);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

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

      it('should return 422 status code when failed to calculate checksum for input file - cannot create read stream', async () => {
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
        const newLayerName = getMapServingLayerName(layerRequest.metadata.productId, layerRequest.metadata.productType);
        const originalCreateReadStream = fs.createReadStream;

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
        jest
          .spyOn(fs, 'createReadStream')
          .mockImplementationOnce((...args) => originalCreateReadStream(...args)) // mock replies to product shapefile
          .mockImplementationOnce((...args) => originalCreateReadStream(...args))
          .mockImplementationOnce((...args) => originalCreateReadStream(...args))
          .mockImplementationOnce((...args) => originalCreateReadStream(...args))
          .mockImplementation(() => {
            throw new Error();
          });

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
        const layerRequest = createNewLayerRequest({ inputFiles: validInputFiles.inputFiles });
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
      it('should return 200 status code with update request when product shapefile is polygon', async () => {
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

      it('should return 200 status code with update request when product shapefile is multipolygon', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'validIndexedMultiPolygon' },
          callbackUrls: undefined,
        });
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

      it('should return 200 status code with swap update request when product shapefile is polygon', async () => {
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

      it('should return 200 status code with swap update request when product shapefile is multipolygon', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'validIndexedMultiPolygon' },
        });
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
        badRequest: DeepPartial<IngestionUpdateLayer>;
        removeProperty?: FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>;
      }[] = [
        {
          testCase: 'req body is not an object',
          badRequest: '' as DeepPartial<IngestionUpdateLayer>,
        },
        {
          testCase: 'inputFiles in req body is not set',
          badRequest: createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles'],
        },
        {
          testCase: 'inputFiles in req body is not an object',
          badRequest: merge(createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: '',
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not set',
          badRequest: createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }),
          removeProperty: ['inputFiles', 'gpkgFilesPath'],
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is not an array',
          badRequest: merge(createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles }), {
            inputFiles: { gpkgFilesPath: faker.string.alphanumeric({ length: { min: 1, max: 100 } }) },
          }),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with items count not equal to 1',
          badRequest: set(
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
          badRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { gpkgFilesPath: [false] } }
          ),
        },
        {
          testCase: 'gpkgFilesPath in inputFiles in req body is an array with 1 item that does not match file pattern',
          badRequest: createUpdateLayerRequest({
            inputFiles: {
              ...validInputFiles.inputFiles,
              gpkgFilesPath: [rasterLayerInputFilesGenerators.gpkgFilesPath()[0] + ' '],
            },
          }),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not set',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'productShapefilePath'],
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body is not a string',
          badRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: false } }
          ),
        },
        {
          testCase: 'productShapefilePath in inputFiles in req body does not match file pattern',
          badRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { productShapefilePath: rasterLayerInputFilesGenerators.productShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not set',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['inputFiles', 'metadataShapefilePath'],
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body is not a string',
          badRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: false } }
          ),
        },
        {
          testCase: 'metadataShapefilePath in inputFiles in req body does not match file pattern',
          badRequest: merge(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            { inputFiles: { metadataShapefilePath: rasterLayerInputFilesGenerators.metadataShapefilePath() + ' ' } }
          ),
        },
        {
          testCase: 'metadata in req body is not set',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata'],
        },
        {
          testCase: 'metadata in req body is not an object',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: '' as unknown as IngestionUpdateLayer['metadata'],
          }),
        },
        {
          testCase: 'classification in metadata in req body is not set',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['metadata', 'classification'],
        },
        {
          testCase: 'classification in metadata in req body is not a string',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: { classification: false as unknown as string },
          }),
        },
        {
          testCase: 'classification in metadata in req body does not match string pattern',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            metadata: { classification: '00' },
          }),
        },
        {
          testCase: 'ingestionResolution in req body is not set',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
          }),
          removeProperty: ['ingestionResolution'],
        },
        {
          testCase: 'ingestionResolution in req body is not a number',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: '' as unknown as number,
          }),
        },
        {
          testCase: 'ingestionResolution in req body is not in a range of valid values',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            ingestionResolution: faker.helpers.arrayElement([
              faker.number.float({ min: Number.MIN_SAFE_INTEGER, max: CORE_VALIDATIONS.resolutionDeg.min }),
              faker.number.float({ min: CORE_VALIDATIONS.resolutionDeg.max + Number.EPSILON, max: Number.MAX_SAFE_INTEGER }),
            ]),
          }),
        },
        {
          testCase: 'callbackUrls in req body is not an array',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: '' as unknown as string[],
          }),
        },
        {
          testCase: 'callbackUrls in req body is an empty array',
          badRequest: set(
            createUpdateLayerRequest({
              inputFiles: validInputFiles.inputFiles,
            }),
            ['callbackUrls'] satisfies FlattenKeyTupleUnion<DeepRequired<IngestionNewLayer>>,
            []
          ),
        },
        {
          testCase: 'callbackUrls in req body does not match url pattern',
          badRequest: createUpdateLayerRequest({
            inputFiles: validInputFiles.inputFiles,
            callbackUrls: [faker.internet.url() + ' '],
          }),
        },
      ];

      it.each(badRequestBodyTestCases)('should return 400 status code when invalid input - $testCase', async ({ badRequest, removeProperty }) => {
        if (removeProperty) {
          unset(badRequest, removeProperty);
        }
        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.updateLayer(rasterLayerMetadataGenerators.id(), badRequest as IngestionUpdateLayer);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

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
        {
          case: 'multiple files missing',
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'missingMultiple' },
        },
      ];
      it.each(fileMissingTestCases)('should return 404 status code when file does not exist - $case', async ({ inputFiles }) => {
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
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
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

      it('should return 422 status code when failed to calculate checksum for input file - cannot create read stream', async () => {
        const layerRequest = createUpdateLayerRequest({ inputFiles: validInputFiles.inputFiles, callbackUrls: undefined });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;
        const updateLayerName = getMapServingLayerName(updatedLayerMetadata.productId, updatedLayerMetadata.productType);
        const originalCreateReadStream = fs.createReadStream;
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
        jest
          .spyOn(fs, 'createReadStream')
          .mockImplementationOnce((...args) => originalCreateReadStream(...args)) // mock replies to product shapefile
          .mockImplementationOnce((...args) => originalCreateReadStream(...args))
          .mockImplementationOnce((...args) => originalCreateReadStream(...args))
          .mockImplementationOnce((...args) => originalCreateReadStream(...args))
          .mockImplementation(() => {
            throw new Error();
          });

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

  describe('PUT /ingestion/:jobId/retry', () => {
    // Format input files paths for storage (as they would appear in stored job parameters)
    const storedInputFiles = {
      gpkgFilesPath: [`gpkg/${validInputFiles.inputFiles.gpkgFilesPath[0]}`],
      metadataShapefilePath: `metadata/${validInputFiles.inputFiles.metadataShapefilePath}/ShapeMetadata.shp`,
      productShapefilePath: `product/${validInputFiles.inputFiles.productShapefilePath}/Product.shp`,
    };

    const createRetryJob = (options: {
      jobId: string;
      productId: string;
      productType: RasterProductTypes;
      status: OperationStatus;
      inputFiles?: unknown;
    }): IJobResponse<unknown, unknown> => {
      const { jobId, productId, productType, status, inputFiles = storedInputFiles } = options;
      return generateMockJob({
        id: jobId,
        resourceId: productId,
        productType,
        status,
        parameters: {
          inputFiles,
        },
      });
    };

    describe('Happy Path', () => {
      it('should return 200 status code when validation is valid and job is FAILED - easy reset job', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: true,
            checksums: validInputFiles.checksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);
        nock(jobManagerURL).post(`/jobs/${jobId}/reset`).reply(httpStatusCodes.OK);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });

      it('should return 200 status code when validation is valid and job is SUSPENDED - easy reset job', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.SUSPENDED });
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: true,
            checksums: validInputFiles.checksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);
        nock(jobManagerURL).post(`/jobs/${jobId}/reset`).reply(httpStatusCodes.OK);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });

      it('should return 200 status code when validation is invalid with changed checksums - hard reset job', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        // Simulate old state with fewer checksums (3 items) - new files were added
        const oldChecksums = validInputFiles.checksums.slice(0, 3);
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: oldChecksums,
          },
        };
        const requestBodyForTaskRessting = {
          parameters: { isValid: false, checksums: validInputFiles.checksums },
          status: OperationStatus.PENDING,
          attempts: 0,
          percentage: 0,
          reason: '',
        };
        const requestBodyForJobRessting = { status: OperationStatus.PENDING, reason: '' };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);
        nock(jobManagerURL).patch(`/jobs/${jobId}/tasks/${taskId}`).reply(httpStatusCodes.OK);
        nock(jobManagerURL).patch(`/jobs/${jobId}`).reply(httpStatusCodes.OK);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        nock(jobManagerURL)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          .put(`/jobs/${jobId}/tasks/${taskId}`, requestBodyForTaskRessting as any)
          .reply(httpStatusCodes.OK);
        nock(jobManagerURL).put(`/jobs/${jobId}`, requestBodyForJobRessting).reply(httpStatusCodes.OK);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });

    describe('Bad Path', () => {
      it('should return 409 CONFLICT status code when job is in PENDING status', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.PENDING });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should return 409 CONFLICT status code when job is in IN_PROGRESS status', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.IN_PROGRESS });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should return 409 CONFLICT status code when job is in COMPLETED status', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.COMPLETED });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should return 409 CONFLICT status code when job is in EXPIRED status', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.EXPIRED });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it('should return 409 CONFLICT status code when job is in ABORTED status', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.ABORTED });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });
    });

    describe('Sad Path', () => {
      it('should return 404 NOT_FOUND status code when validation task does not exist', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        const otherTask = {
          id: faker.string.uuid(),
          jobId,
          type: 'some-other-task-type',
          status: OperationStatus.COMPLETED,
          parameters: {},
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [otherTask]);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('no validation task was found');
      });

      it('should return 404 NOT_FOUND status code when no tasks exist for the job', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, []);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('no validation task was found');
      });

      it('should return 409 CONFLICT status code when validation is invalid and checksums have not changed', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: validInputFiles.checksums, // Same checksums - no change
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('not a single metadata shapefile has been changed');
      });

      it('should return 400 BAD_REQUEST status code when validation task has invalid parameters schema', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            // Missing required fields like isValid and checksums
            invalidField: 'invalid',
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('checksums: Required');
      });

      it('should return 400 BAD_REQUEST status code when validation is invalid and input files have invalid schema', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({
          jobId,
          productId,
          productType,
          status: OperationStatus.FAILED,
          inputFiles: {
            // Invalid structure - missing required fields
            invalidField: 'invalid',
          },
        });
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: validInputFiles.checksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain(
          'gpkgFilesPath: Files should be an array of .gpkg file names | metadataShapefilePath: Required | productShapefilePath: Required'
        );
      });

      it('should return 500 INTERNAL_SERVER_ERROR status code when job manager fails to get job', async () => {
        const jobId = faker.string.uuid();

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.INTERNAL_SERVER_ERROR);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 INTERNAL_SERVER_ERROR status code when job manager fails to get tasks', async () => {
        const jobId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.INTERNAL_SERVER_ERROR);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 INTERNAL_SERVER_ERROR status code when job manager fails to update task', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        const oldChecksums = validInputFiles.checksums.slice(0, 3);
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: oldChecksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);
        nock(jobManagerURL).patch(`/jobs/${jobId}/tasks/${taskId}`).reply(httpStatusCodes.INTERNAL_SERVER_ERROR);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 INTERNAL_SERVER_ERROR status code when job manager fails to update job', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        const oldChecksums = validInputFiles.checksums.slice(0, 3);
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: oldChecksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);
        nock(jobManagerURL)
          .patch(
            `/jobs/${jobId}/tasks/${taskId}`,
            matches((body: { parameters?: { checksums?: unknown[]; isValid?: boolean; report?: unknown } }) => {
              return (
                body.parameters?.checksums?.length === validInputFiles.checksums.length &&
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                body.parameters?.isValid === false &&
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                body.parameters?.report === undefined
              );
            })
          )
          .reply(httpStatusCodes.OK);
        nock(jobManagerURL).patch(`/jobs/${jobId}`).reply(httpStatusCodes.INTERNAL_SERVER_ERROR);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
      });

      it('should return 500 INTERNAL_SERVER_ERROR status code when calculating checksums fails for changed files', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const retryJob = createRetryJob({ jobId, productId, productType, status: OperationStatus.FAILED });
        // Simulate old state with fewer checksums (3 items) - new files were added
        const oldChecksums = validInputFiles.checksums.slice(0, 3);
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: oldChecksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);
        jest.spyOn(Checksum.prototype, 'calculate').mockRejectedValueOnce(new Error('Checksum calculation failed'));

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.INTERNAL_SERVER_ERROR);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('Checksum calculation failed');
      });

      it('should return 404 NOT_FOUND status code when metadata shapefile does not exist during hard reset', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const nonExistentInputFiles = {
          gpkgFilesPath: [`gpkg/${validInputFiles.inputFiles.gpkgFilesPath[0]}`],
          metadataShapefilePath: 'metadata/nonexistent-shapefile/ShapeMetadata.shp',
          productShapefilePath: `product/${validInputFiles.inputFiles.productShapefilePath}/Product.shp`,
        };
        const retryJob = createRetryJob({
          jobId,
          productId,
          productType,
          status: OperationStatus.FAILED,
          inputFiles: nonExistentInputFiles,
        });
        const oldChecksums = validInputFiles.checksums.slice(0, 3);
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: oldChecksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('ShapeMetadata.shp');
      });

      it('should return 404 NOT_FOUND status code when GPKG file does not exist during hard reset', async () => {
        const jobId = faker.string.uuid();
        const taskId = faker.string.uuid();
        const productId = rasterLayerMetadataGenerators.productId();
        const productType = rasterLayerMetadataGenerators.productType();
        const nonExistentInputFiles = {
          gpkgFilesPath: ['gpkg/nonexistent-file.gpkg'],
          metadataShapefilePath: `metadata/${validInputFiles.inputFiles.metadataShapefilePath}/ShapeMetadata.shp`,
          productShapefilePath: `product/${validInputFiles.inputFiles.productShapefilePath}/Product.shp`,
        };
        const retryJob = createRetryJob({
          jobId,
          productId,
          productType,
          status: OperationStatus.FAILED,
          inputFiles: nonExistentInputFiles,
        });
        const oldChecksums = validInputFiles.checksums.slice(0, 3);
        const validationTask = {
          id: taskId,
          jobId,
          type: configMock.get<string>('jobManager.validationTaskType'),
          status: OperationStatus.COMPLETED,
          parameters: {
            isValid: false,
            checksums: oldChecksums,
          },
        };

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, retryJob);
        nock(jobManagerURL).get(`/jobs/${jobId}/tasks`).reply(httpStatusCodes.OK, [validationTask]);
        nock(polygonPartsManagerURL).delete('/polygonParts/validate').query({ productType, productId }).reply(httpStatusCodes.NO_CONTENT);

        const response = await requestSender.retryIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
        expect(response.body).toHaveProperty('message');
        expect((response.body as { message: string }).message).toContain('nonexistent-file.gpkg');
      });
    });
  });

  describe('PUT /ingestion/:jobId/abort', () => {
    const abortableStatuses = [OperationStatus.FAILED, OperationStatus.SUSPENDED, OperationStatus.IN_PROGRESS, OperationStatus.PENDING];
    const nonAbortableStatuses = [OperationStatus.COMPLETED, OperationStatus.ABORTED];

    describe('Happy Path', () => {
      it.each(abortableStatuses)('should return 200 status code when aborting job with %s status', async (status) => {
        const mockJob = generateMockJob({ status });
        const tasks = [
          { id: faker.string.uuid(), type: 'validation', status: OperationStatus.COMPLETED },
          { id: faker.string.uuid(), type: 'init', status: OperationStatus.COMPLETED },
        ];

        nock(jobManagerURL).get(`/jobs/${mockJob.id}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, mockJob);
        nock(jobManagerURL).get(`/jobs/${mockJob.id}/tasks`).reply(httpStatusCodes.OK, tasks);
        nock(jobManagerURL).post(`/tasks/abort/${mockJob.id}`).reply(httpStatusCodes.OK);
        nock(polygonPartsManagerURL)
          .delete('/polygonParts/validate')
          .query({ productType: mockJob.productType, productId: mockJob.resourceId })
          .reply(httpStatusCodes.NO_CONTENT);

        const response = await requestSender.abortIngestion(mockJob.id);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });

      it('should return 200 status code when aborting job with no tasks', async () => {
        const mockJob = generateMockJob({ status: OperationStatus.FAILED });

        nock(jobManagerURL).get(`/jobs/${mockJob.id}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, mockJob);
        nock(jobManagerURL).get(`/jobs/${mockJob.id}/tasks`).reply(httpStatusCodes.OK, []);
        nock(jobManagerURL).post(`/tasks/abort/${mockJob.id}`).reply(httpStatusCodes.OK);
        nock(polygonPartsManagerURL)
          .delete('/polygonParts/validate')
          .query({ productType: mockJob.productType, productId: mockJob.resourceId })
          .reply(httpStatusCodes.NO_CONTENT);

        const response = await requestSender.abortIngestion(mockJob.id);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
      });
    });

    describe('Bad Path', () => {
      it.each(nonAbortableStatuses)('should return 409 CONFLICT status code when job is in %s status', async (status) => {
        const mockJob = generateMockJob({ status });

        nock(jobManagerURL).get(`/jobs/${mockJob.id}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, mockJob);

        const response = await requestSender.abortIngestion(mockJob.id);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });

      it.each(abortableStatuses)('should return 409 CONFLICT status code when job with %s status has finalize task', async (status) => {
        const mockJob = generateMockJob({ status });
        const tasks = [
          { id: faker.string.uuid(), type: 'validation', status: OperationStatus.COMPLETED },
          { id: faker.string.uuid(), type: configMock.get<string>('jobManager.finalizeTaskType'), status: OperationStatus.PENDING },
        ];

        nock(jobManagerURL).get(`/jobs/${mockJob.id}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.OK, mockJob);
        nock(jobManagerURL).get(`/jobs/${mockJob.id}/tasks`).reply(httpStatusCodes.OK, tasks);

        const response = await requestSender.abortIngestion(mockJob.id);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.CONFLICT);
      });
    });

    describe('Sad Path', () => {
      it('should return 404 NOT_FOUND status code when job does not exist', async () => {
        const jobId = faker.string.uuid();

        nock(jobManagerURL).get(`/jobs/${jobId}`).query({ shouldReturnTasks: false }).reply(httpStatusCodes.NOT_FOUND);

        const response = await requestSender.abortIngestion(jobId);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });
    });
  });
});
