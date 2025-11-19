import fs from 'node:fs';
import { faker } from '@faker-js/faker';
import { OperationStatus, type ICreateJobResponse } from '@map-colonies/mc-priority-queue';
import { ShapefileChunkReader } from '@map-colonies/mc-utils';
import { CORE_VALIDATIONS, getMapServingLayerName, RasterProductTypes, SHAPEFILE_EXTENSIONS_LIST } from '@map-colonies/raster-shared';
import { SqliteError } from 'better-sqlite3';
import httpStatusCodes from 'http-status-codes';
import { matches, merge, set, unset } from 'lodash';
import nock from 'nock';
import { randexp } from 'randexp';
import xxhashFactory from 'xxhash-wasm';
import { getApp } from '../../../src/app';
import { type ResponseId } from '../../../src/ingestion/interfaces';
import type { IngestionNewLayer } from '../../../src/ingestion/schemas/newLayerSchema';
import type { IngestionUpdateLayer } from '../../../src/ingestion/schemas/updateLayerSchema';
import { SQLiteClient } from '../../../src/serviceClients/database/SQLiteClient';
import { Checksum } from '../../../src/utils/hash/checksum';
import type { ChecksumProcessor, HashAlgorithm } from '../../../src/utils/hash/interfaces';
import { configMock } from '../../mocks/configMock';
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
import { validInputFiles } from '../../mocks/static/exampleData';
import type { DeepPartial, DeepRequired, FlattenKeyTupleUnion } from '../../utils/types';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';
import { IngestionRequestSender } from './helpers/ingestionRequestSender';

describe('Ingestion', () => {
  let jobManagerURL: string;
  let mapProxyApiServiceUrl: string;
  let catalogServiceURL: string;
  let jobResponse: ICreateJobResponse;
  let requestSender: IngestionRequestSender;

  const mocksChecksumUpdate = Array.from({ length: SHAPEFILE_EXTENSIONS_LIST.length }, () =>
    jest.fn<ReturnType<ChecksumProcessor['update']>, Parameters<ChecksumProcessor['update']>>()
  );
  const mocksChecksumDigest = Array.from({ length: SHAPEFILE_EXTENSIONS_LIST.length }, () =>
    jest.fn<ReturnType<ChecksumProcessor['digest']>, Parameters<ChecksumProcessor['digest']>>()
  );
  beforeEach(() => {
    let mockedFileIndex = 0;

    const defaultOptions = {
      checksumProcessor: (): (() => Promise<ChecksumProcessor>) => {
        const result = async () => {
          const xxhash = await xxhashFactory();
          const xx64hash = xxhash.create64();

          const mockProcessor = {
            algorithm: 'XXH64',
            update: mocksChecksumUpdate[mockedFileIndex].mockImplementation((...args) => {
              return xx64hash.update(...args);
            }),
            digest: mocksChecksumDigest[mockedFileIndex].mockImplementation((...args) => {
              return xx64hash.digest(...args);
            }),
          } satisfies ChecksumProcessor;
          mockedFileIndex++;
          return Object.assign(mockProcessor, { algorithm: 'XXH64' as const satisfies HashAlgorithm });
        };
        return result;
      },
    };

    const [app] = getApp({
      override: [...getTestContainerConfig(defaultOptions)],
    });
    jobResponse = {
      id: faker.string.uuid(),
      taskIds: [faker.string.uuid()],
    };

    jobManagerURL = configMock.get<string>('services.jobManagerURL');
    mapProxyApiServiceUrl = configMock.get<string>('services.mapProxyApiServiceUrl');
    catalogServiceURL = configMock.get<string>('services.catalogServiceURL');

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
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'validMultiPolygon' },
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

      it('should return 400 status code when product shapefile has 0 features', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'empty',
          },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 400 status code when product shapefile has more than 1 feature', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'multiple',
          },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 400 status code when product shapefile is not polygon or multipolygon', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'point',
          },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 400 status code when product shapefile is not contained within gpkg extent', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
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
          inputFiles: { gpkgFilesPath: ['invalidCrs-3857.gpkg'], metadataShapefilePath: 'valid', productShapefilePath: 'valid' },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when failed to read and process product shapefile', async () => {
        const layerRequest = createNewLayerRequest({
          inputFiles: { gpkgFilesPath: ['validIndexed.gpkg'], metadataShapefilePath: 'valid', productShapefilePath: 'valid' },
        });

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockRejectedValueOnce(new Error());

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

      it('should return 422 status code when failed to calculate checksum for input file - processing chunk', async () => {
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
        mocksChecksumUpdate[0].mockImplementationOnce(() => {
          throw new Error();
        });

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
        expect(scope.isDone()).toBe(false);
      });

      it('should return 422 status code when failed to calculate checksum for input file - digesting chunk', async () => {
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
        mocksChecksumDigest[0].mockImplementationOnce(() => {
          throw new Error();
        });

        const response = await requestSender.ingestNewLayer(layerRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.UNPROCESSABLE_ENTITY);
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
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'validMultiPolygon' },
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
          inputFiles: { ...validInputFiles.inputFiles, productShapefilePath: 'validMultiPolygon' },
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

      it('should return 400 status code when product shapefile has 0 features', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'empty',
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

      it('should return 400 status code when product shapefile has more than 1 feature', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'multiple',
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

      it('should return 400 status code when product shapefile is not polygon or multipolygon', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'point',
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

      it('should return 400 status code when product shapefile is not contained within gpkg extent', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
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
          inputFiles: { gpkgFilesPath: ['invalidCrs-3857.gpkg'], metadataShapefilePath: 'valid', productShapefilePath: 'valid' },
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
          inputFiles: { gpkgFilesPath: ['invalid.gpkg'], metadataShapefilePath: 'valid', productShapefilePath: 'valid' },
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
          inputFiles: { gpkgFilesPath: ['withoutGpkgIndex.gpkg'], metadataShapefilePath: 'valid', productShapefilePath: 'valid' },
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
          inputFiles: { gpkgFilesPath: ['unsupportedGridMatrix.gpkg'], metadataShapefilePath: 'valid', productShapefilePath: 'valid' },
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
            metadataShapefilePath: 'valid',
            productShapefilePath: 'valid',
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
            metadataShapefilePath: 'valid',
            productShapefilePath: 'valid',
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

      it('should return 422 status code when failed to read and process product shapefile', async () => {
        const layerRequest = createUpdateLayerRequest({
          inputFiles: {
            gpkgFilesPath: ['validIndexed.gpkg'],
            metadataShapefilePath: 'valid',
            productShapefilePath: 'valid',
          },
        });
        const updatedLayer = createCatalogLayerResponse();
        const updatedLayerMetadata = updatedLayer.metadata;

        const scope = nock(jobManagerURL).post('/jobs').reply(httpStatusCodes.OK, jobResponse);
        nock(catalogServiceURL).post('/records/find', { id: updatedLayerMetadata.id }).reply(httpStatusCodes.OK, [updatedLayer]);
        jest.spyOn(ShapefileChunkReader.prototype, 'readAndProcess').mockRejectedValueOnce(new Error());

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
            metadataShapefilePath: 'valid',
            productShapefilePath: 'valid',
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
