import { faker } from '@faker-js/faker';
import httpStatusCodes from 'http-status-codes';
import unset from 'lodash.unset';
import nock from 'nock';
import { getApp } from '../../../src/app';
import type { GpkgInputFiles } from '../../../src/ingestion/schemas/inputFilesSchema';
import { getGpkgsFilesLocalPath, rasterLayerInputFilesGenerators } from '../../mocks/mockFactory';
import { validInputFiles } from '../../mocks/static/exampleData';
import type { DeepPartial, DeepRequired, FlattenKeyTupleUnion } from '../../utils/types';
import { getTestContainerConfig, resetContainer } from './helpers/containerConfig';
import { InfoRequestSender } from './helpers/infoRequestSender';

describe('Info', function () {
  let requestSender: InfoRequestSender;

  beforeEach(function () {
    const [app] = getApp({
      override: [...getTestContainerConfig()],
    });

    requestSender = new InfoRequestSender(app);
  });

  afterEach(function () {
    resetContainer();
    jest.restoreAllMocks();
    nock.cleanAll();
  });

  describe('POST /info/gpkgs', () => {
    describe('Happy Path', () => {
      it('should return 200 status code and sources info', async () => {
        const request = { gpkgFilesPath: getGpkgsFilesLocalPath(validInputFiles.inputFiles.gpkgFilesPath) };
        const expectedResponseBody = [
          {
            crs: 4326,
            fileFormat: 'GPKG',
            pixelSize: 0.001373291015625,
            extentPolygon: {
              type: 'Polygon',
              coordinates: [
                [
                  [34.61517, 34.10156],
                  [34.61517, 32.242124],
                  [36.4361539, 32.242124],
                  [36.4361539, 34.10156],
                  [34.61517, 34.10156],
                ],
              ],
            },
            fileName: 'tests/mocks/testFiles/gpkg/validIndexed.gpkg',
          },
        ];

        const response = await requestSender.getGpkgsInfo(request);

        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toStrictEqual(expectedResponseBody);
      });

      it('should return 200 status code and sources info invalid response - unsupported CRS', async () => {
        const badRequest = { gpkgFilesPath: getGpkgsFilesLocalPath(['invalidCrs-3857.gpkg']) };
        const expectedResponseBody = [
          {
            crs: 3857,
            fileFormat: 'GPKG',
            pixelSize: 0.29858214173897,
            extentPolygon: {
              type: 'Polygon',
              coordinates: [
                [
                  [34.834239, 32.056389],
                  [34.834239, 32.0378693],
                  [34.852757, 32.0378693],
                  [34.852757, 32.056389],
                  [34.834239, 32.056389],
                ],
              ],
            },
            fileName: 'tests/mocks/testFiles/gpkg/invalidCrs-3857.gpkg',
          },
        ];
        const response = await requestSender.getGpkgsInfo(badRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.OK);
        expect(response.body).toStrictEqual(expectedResponseBody);
      });
    });

    describe('Bad Path', () => {
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

        const response = await requestSender.getGpkgsInfo(badRequest as GpkgInputFiles);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.BAD_REQUEST);
      });
    });

    describe('Sad Path', () => {
      it('should return 404 status code when gpkgs not found', async () => {
        const badRequest = { gpkgFilesPath: rasterLayerInputFilesGenerators.gpkgFilesPath() };

        const response = await requestSender.getGpkgsInfo(badRequest);

        expect(response).toSatisfyApiSpec();
        expect(response.status).toBe(httpStatusCodes.NOT_FOUND);
      });
    });
  });
});
