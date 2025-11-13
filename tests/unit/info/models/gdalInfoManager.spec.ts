import { BadRequestError } from '@map-colonies/error-types';
import { container } from 'tsyringe';
import { getApp } from '../../../../src/app';
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GdalUtilities } from '../../../../src/utils/gdal/gdalUtilities';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { registerDefaultConfig } from '../../../mocks/configMock';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

describe('GdalInfoManager', () => {
  let gdalInfoManager: GdalInfoManager;
  let schemaValidator: SchemasValidator;

  beforeEach(() => {
    const [, container] = getApp({
      override: [...getTestContainerConfig()],
      useChild: true,
    });
    schemaValidator = container.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
    gdalInfoManager = container.resolve<GdalInfoManager>(GDAL_INFO_MANAGER_SYMBOL);
    registerDefaultConfig();
  });

  afterEach(() => {
    container.clearInstances();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    container.clearInstances();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('validateInfoData', () => {
    it('should succesfuly validate gdal info data according to number of gpkg source files', async () => {
      const { gpkgFilesPath } = generateInputFiles();

      const schemaValidatorSpy = jest.spyOn(schemaValidator, 'validateInfoData').mockResolvedValue(mockGdalInfoDataWithFile);

      expect(await gdalInfoManager.validateInfoData([mockGdalInfoDataWithFile])).toBeUndefined();
      expect(schemaValidatorSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });

    it('should throw gdal info error - Unsupported CRS', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, crs: 3857 };

      jest.spyOn(schemaValidator, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported CRS'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(/Unsupported CRS/);
    });

    it('should throw gdal info error - Unsupported pixel size', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, pixelSize: 0.9 };

      jest.spyOn(schemaValidator, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported pixel size'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(/Unsupported pixel size/);
    });

    it('should throw gdal info error - Unsupported file format', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, fileFormat: 'TIFF' };

      jest.spyOn(schemaValidator, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported file format'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(/Unsupported file format/);
    });
  });

  describe('getInfoData', () => {
    it('should return gdal info data array', async () => {
      const gpkgFilesPath: string[] = [mockGdalInfoDataWithFile.fileName];
      const managerGdalInfoSpy = jest.spyOn(GdalInfoManager.prototype, 'getInfoData');
      const utilityGdalInfoSpy = jest.spyOn(GdalUtilities.prototype, 'getInfoData');
      utilityGdalInfoSpy.mockResolvedValue(mockGdalInfoDataWithFile);

      const result = await gdalInfoManager.getInfoData(gpkgFilesPath);

      expect(result).toEqual([mockGdalInfoDataWithFile]);
      expect(managerGdalInfoSpy).toHaveBeenCalledTimes(1);
      expect(utilityGdalInfoSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      expect(managerGdalInfoSpy).toHaveBeenCalledWith(gpkgFilesPath);
    });

    it('should throw an GdalError when error occur', async () => {
      const gpkgFilesPath: string[] = [mockGdalInfoDataWithFile.fileName];

      jest.spyOn(GdalUtilities.prototype, 'getInfoData').mockRejectedValue(new Error('Unknown Error'));
      await expect(gdalInfoManager.getInfoData(gpkgFilesPath)).rejects.toThrow(GdalInfoError);
    });
  });
});
