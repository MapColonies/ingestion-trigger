import { BadRequestError } from '@map-colonies/error-types';
import { IConfig } from 'config';
import { container } from 'tsyringe';
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { registerDefaultConfig } from '../../../mocks/configMock';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { GdalUtilities } from '../../../../src/utils/gdal/gdalUtilities';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';
import { GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { getApp } from '../../../../src/app';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { SERVICES } from '../../../../src/common/constants';

describe('GdalInfoManager', () => {
  let gdalInfoManager: GdalInfoManager;
  let schemaValidator: SchemasValidator;
  let sourceMount: string;

  beforeEach(() => {
    const [, container] = getApp({
      override: [...getTestContainerConfig()],
      useChild: true,
    });
    sourceMount = container.resolve<IConfig>(SERVICES.CONFIG).get<string>('storageExplorer.layerSourceDir');
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
      const { gpkgFilesPath } = mockInputFiles;

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
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, pixelSize: 0.9};

      jest.spyOn(schemaValidator, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported pixel size'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(/Unsupported pixel size/);
    });

    it('should throw gdal info error - Unsupported file format', async () => {
      const invalidGdalInfo = { ...mockGdalInfoDataWithFile, fileFormat: 'TIFF'};

      jest.spyOn(schemaValidator, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported file format'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(/Unsupported file format/);
    });
  });

  describe('getInfoData', () => {
    it('should return gdal info data array', async () => {
      const gpkgFilesPath: string[] = [mockGdalInfoDataWithFile.gpkgFilePath];
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
      const gpkgFilesPath: string[] = [mockGdalInfoDataWithFile.gpkgFilePath];

      jest.spyOn(GdalUtilities.prototype, 'getInfoData').mockRejectedValue(new Error('Unknown Error'));
      await expect(gdalInfoManager.getInfoData(gpkgFilesPath)).rejects.toThrow(GdalInfoError);
    });
  });
});
