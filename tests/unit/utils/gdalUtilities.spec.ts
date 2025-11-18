import { faker } from '@faker-js/faker';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { Dataset } from 'gdal-async';
import type { GdalInfo } from '../../../src/ingestion/schemas/gdalDataSchema';
import { InfoData } from '../../../src/ingestion/schemas/infoDataSchema';
import { GdalUtilities } from '../../../src/utils/gdal/gdalUtilities';
import type { SchemasValidator } from '../../../src/utils/validation/schemasValidator';
import { registerDefaultConfig } from '../../mocks/configMock';
import { generateInputFiles } from '../../mocks/mockFactory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OverloadedReturnAndParamsType<T extends (...args: any[]) => any> = T extends {
  (...args: infer P1): infer R1;
  (...args: infer P2): infer R2;
}
  ? [[P1, R1], [P2, R2]]
  : T extends (...args: infer P) => infer R
  ? [[P, R]]
  : never;

type GdalAsync = typeof import('gdal-async');
type GdalOpenAsyncReturn = OverloadedReturnAndParamsType<GdalAsync['openAsync']>[1][1];
type GdalOpenAsyncParameters = OverloadedReturnAndParamsType<GdalAsync['openAsync']>[1][0];
const mockGdalOpenAsync = jest.fn<GdalOpenAsyncReturn, GdalOpenAsyncParameters>();
const mockGdalInfoAsync = jest.fn<ReturnType<GdalAsync['infoAsync']>, Parameters<GdalAsync['infoAsync']>>();

jest.mock<GdalAsync>('gdal-async', () => {
  const originalModule = jest.requireActual<GdalAsync>('gdal-async');
  return {
    ...originalModule,
    openAsync: jest.fn<GdalOpenAsyncReturn, GdalOpenAsyncParameters>().mockImplementation(async (...args) => {
      return mockGdalOpenAsync(...args);
    }),
    infoAsync: jest.fn<ReturnType<GdalAsync['infoAsync']>, Parameters<GdalAsync['infoAsync']>>().mockImplementation(async (...args) => {
      return mockGdalInfoAsync(...args);
    }),
  } as unknown as GdalAsync;
});

describe('gdalUtilities', () => {
  let gdalUtilities: GdalUtilities;
  const schemasValidator = { validateGdalInfo: jest.fn<Promise<GdalInfo>, [unknown]>() } satisfies Partial<SchemasValidator>;

  beforeEach(function () {
    gdalUtilities = new GdalUtilities(jsLogger({ enabled: false }), trace.getTracer('testTracer'), schemasValidator as unknown as SchemasValidator);
    registerDefaultConfig();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getInfoData', () => {
    it('should extract CRS, fileFormat, pixelSize and footprint from gpkg file', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      const mockedGeotransform = faker.helpers.multiple(() => faker.number.float(), { count: 6 });
      const mockedDataset = { geoTransform: mockedGeotransform, close: () => {} };
      const infoData = {
        driverShortName: 'GPKG',
        geoTransform: mockedGeotransform,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        stac: { 'proj:epsg': 4326 },
        wgs84Extent: {
          coordinates: [
            [
              [34.61517, 34.10156],
              [34.61517, 32.242124],
              [36.4361539, 32.242124],
              [36.4361539, 34.10156],
              [34.61517, 34.10156],
            ],
          ],
          type: 'Polygon' as const,
        },
      };
      const expected: InfoData = {
        crs: infoData.stac['proj:epsg'],
        extentPolygon: infoData.wgs84Extent,
        fileFormat: infoData.driverShortName,
        pixelSize: mockedGeotransform[1],
      };
      mockGdalOpenAsync.mockResolvedValue(mockedDataset as unknown as Dataset);
      mockGdalInfoAsync.mockResolvedValue(JSON.stringify(infoData));
      schemasValidator.validateGdalInfo.mockResolvedValue(infoData);

      const response = await gdalUtilities.getInfoData(gpkgFilesPath[0]);

      expect(response).toStrictEqual(expected);
      expect(mockGdalOpenAsync).toHaveBeenCalledTimes(1);
      expect(mockGdalInfoAsync).toHaveBeenCalledTimes(1);
      expect(schemasValidator.validateGdalInfo).toHaveBeenCalledTimes(1);
    });

    it('should throw error when fails to open dataset', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      const errorMessage = 'error';
      mockGdalOpenAsync.mockRejectedValue(new Error(errorMessage));

      const promise = gdalUtilities.getInfoData(gpkgFilesPath[0]);

      await expect(promise).rejects.toThrow(new Error(`failed to get gdal info on file: ${gpkgFilesPath[0]}: ${errorMessage}`));
    });

    it('should throw error when fails to read info from dataset', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      const errorMessage = 'error';
      const mockedGeotransform = faker.helpers.multiple(() => faker.number.float(), { count: 6 });
      const mockedDataset = { geoTransform: mockedGeotransform, close: () => {} };
      mockGdalOpenAsync.mockResolvedValue(mockedDataset as unknown as Dataset);
      mockGdalInfoAsync.mockRejectedValue(new Error(errorMessage));

      const promise = gdalUtilities.getInfoData(gpkgFilesPath[0]);

      await expect(promise).rejects.toThrow(new Error(`failed to get gdal info on file: ${gpkgFilesPath[0]}: ${errorMessage}`));
    });

    it('should throw error when fails to parse info from dataset', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      const errorMessage = 'error';
      const mockedGeotransform = faker.helpers.multiple(() => faker.number.float(), { count: 6 });
      const mockedDataset = { geoTransform: null, close: () => {} };
      const infoData = {
        driverShortName: 'GPKG',
        geoTransform: mockedGeotransform,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        stac: { 'proj:epsg': 4326 },
        wgs84Extent: {
          coordinates: [
            [
              [34.61517, 34.10156],
              [34.61517, 32.242124],
              [36.4361539, 32.242124],
              [36.4361539, 34.10156],
              [34.61517, 34.10156],
            ],
          ],
          type: 'Polygon' as const,
        },
      };
      mockGdalOpenAsync.mockResolvedValue(mockedDataset as unknown as Dataset);
      mockGdalInfoAsync.mockResolvedValue(JSON.stringify(infoData));
      jest.spyOn(JSON, 'parse').mockImplementation(() => {
        throw new Error(errorMessage);
      });
      const promise = gdalUtilities.getInfoData(gpkgFilesPath[0]);

      await expect(promise).rejects.toThrow(new Error(`failed to get gdal info on file: ${gpkgFilesPath[0]}: ${errorMessage}`));
    });

    it('should throw error when fails to validate info from dataset', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      const errorMessage = 'error';
      const mockedGeotransform = faker.helpers.multiple(() => faker.number.float(), { count: 6 });
      const mockedDataset = { geoTransform: null, close: () => {} };
      const infoData = {
        driverShortName: 'GPKG',
        geoTransform: mockedGeotransform,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        stac: { 'proj:epsg': 4326 },
        wgs84Extent: {
          coordinates: [
            [
              [34.61517, 34.10156],
              [34.61517, 32.242124],
              [36.4361539, 32.242124],
              [36.4361539, 34.10156],
              [34.61517, 34.10156],
            ],
          ],
          type: 'Polygon' as const,
        },
      };
      mockGdalOpenAsync.mockResolvedValue(mockedDataset as unknown as Dataset);
      mockGdalInfoAsync.mockResolvedValue(JSON.stringify(infoData));
      schemasValidator.validateGdalInfo.mockRejectedValue(new Error(errorMessage));

      const promise = gdalUtilities.getInfoData(gpkgFilesPath[0]);

      await expect(promise).rejects.toThrow(new Error(`failed to get gdal info on file: ${gpkgFilesPath[0]}: ${errorMessage}`));
    });

    it('should throw error when fails to read geoTransform info from dataset', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      const mockedGeotransform = faker.helpers.multiple(() => faker.number.float(), { count: 6 });
      const mockedDataset = { geoTransform: null, close: () => {} };
      const infoData = {
        driverShortName: 'GPKG',
        geoTransform: mockedGeotransform,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        stac: { 'proj:epsg': 4326 },
        wgs84Extent: {
          coordinates: [
            [
              [34.61517, 34.10156],
              [34.61517, 32.242124],
              [36.4361539, 32.242124],
              [36.4361539, 34.10156],
              [34.61517, 34.10156],
            ],
          ],
          type: 'Polygon' as const,
        },
      };
      mockGdalOpenAsync.mockResolvedValue(mockedDataset as unknown as Dataset);
      mockGdalInfoAsync.mockResolvedValue(JSON.stringify(infoData));
      schemasValidator.validateGdalInfo.mockResolvedValue(infoData as unknown as GdalInfo);

      const promise = gdalUtilities.getInfoData(gpkgFilesPath[0]);

      await expect(promise).rejects.toThrow(new Error(`failed to get gdal info on file: ${gpkgFilesPath[0]}: dataset.geoTransform is null`));
    });
  });
});
