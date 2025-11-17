import { BadRequestError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GdalUtilities } from '../../../../src/utils/gdal/gdalUtilities';
import { SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

const mockSchemaValidator = {
  validateInfoData: jest.fn(),
} satisfies Partial<SchemasValidator>;

const mockGdalUtilities = { getInfoData: jest.fn() } satisfies Partial<GdalUtilities>;

describe('GdalInfoManager', () => {
  let gdalInfoManager: GdalInfoManager;

  beforeEach(() => {
    const testTracer = trace.getTracer('testTracer');

    gdalInfoManager = new GdalInfoManager(
      jsLogger({ enabled: false }),
      testTracer,
      mockSchemaValidator as unknown as SchemasValidator,
      mockGdalUtilities as unknown as GdalUtilities
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('validateInfoData', () => {
    it('should succesfuly validate gdal info data according to number of gpkg source files', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      mockSchemaValidator.validateInfoData.mockResolvedValue(mockGdalInfoDataWithFile);

      const promise = gdalInfoManager.validateInfoData([mockGdalInfoDataWithFile]);

      await expect(promise).resolves.not.toThrow();
      expect(mockSchemaValidator.validateInfoData).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });

    it('should throw gdal info error - Unsupported CRS', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, crs: 3857 };
      mockSchemaValidator.validateInfoData.mockRejectedValue(new BadRequestError('Unsupported CRS'));

      const promise = gdalInfoManager.validateInfoData([invalidGdalInfo]);

      await expect(promise).rejects.toThrow(/Unsupported CRS/);
    });

    it('should throw gdal info error - Unsupported pixel size', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, pixelSize: 0.9 };
      mockSchemaValidator.validateInfoData.mockRejectedValue(new BadRequestError('Unsupported pixel size'));

      const promise = gdalInfoManager.validateInfoData([invalidGdalInfo]);

      await expect(promise).rejects.toThrow(/Unsupported pixel size/);
    });

    it('should throw gdal info error - Unsupported file format', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, fileFormat: 'TIFF' };
      mockSchemaValidator.validateInfoData.mockRejectedValue(new BadRequestError('Unsupported file format'));

      const promise = gdalInfoManager.validateInfoData([invalidGdalInfo]);

      await expect(promise).rejects.toThrow(/Unsupported file format/);
    });
  });

  describe('getInfoData', () => {
    it('should return gdal info data array', async () => {
      const gpkgFilesPath: string[] = [mockGdalInfoDataWithFile.fileName];
      mockGdalUtilities.getInfoData.mockResolvedValue(mockGdalInfoDataWithFile);

      const result = await gdalInfoManager.getInfoData(gpkgFilesPath);

      expect(result).toEqual([mockGdalInfoDataWithFile]);
      expect(mockGdalUtilities.getInfoData).toHaveBeenCalledTimes(1);
    });

    it('should throw a GdalError when error occur', async () => {
      const gpkgFilesPath: string[] = [mockGdalInfoDataWithFile.fileName];
      mockGdalUtilities.getInfoData.mockRejectedValue(new Error('Unknown Error'));

      const promise = gdalInfoManager.getInfoData(gpkgFilesPath);

      await expect(promise).rejects.toThrow(GdalInfoError);
    });
  });
});
