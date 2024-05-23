import nodePath from 'node:path';
import { BadRequestError } from '@map-colonies/error-types';
import { IConfig } from 'config';
import { container } from 'tsyringe';
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { registerDefaultConfig } from '../../../mocks/configMock';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { GdalUtilities } from '../../../../src/utils/gdal/gdalUtilities';
import { fakeIngestionSources } from '../../../mocks/sourcesRequestBody';
import { gdalInfoCases } from '../../../mocks/gdalInfoMock';
import { GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { getApp } from '../../../../src/app';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { SERVICES } from '../../../../src/common/constants';

describe('GdalInfoManager', () => {
  let gdalInfoManager: GdalInfoManager;
  let schemaValidator: SchemasValidator;
  let sourceMount: string;
  const schemasValidatorMock = {
    validateInfoData: jest.fn(),
  } as unknown as SchemasValidator;

  const gdalUtilitiesMock = {
    getInfoData: jest.fn(),
  };

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
    jest.resetAllMocks();
  });

  afterAll(() => {
    container.clearInstances();
    jest.clearAllMocks();
  });

  describe('validateInfoData', () => {
    it('should validate gdal info data', async () => {
      const { fileNames } = fakeIngestionSources.validSources.validInputFiles;
      const fileName = fileNames[0];
      const validGdalInfo = { ...gdalInfoCases.validGdalInfo, fileName };

      const schemaValidatorSpy = jest.spyOn(schemaValidator, 'validateInfoData').mockResolvedValue(validGdalInfo);

      expect(await gdalInfoManager.validateInfoData([validGdalInfo])).toBeUndefined();

      expect(schemaValidatorSpy).toHaveBeenCalledTimes(fileNames.length);
    });

    it('should throw gdal info error - Unsupported CRS', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.unsupportedCrs;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const invalidGdalInfo = { ...gdalInfoCases.unsupportedCrs, fileName };

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(invalidGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported CRS'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(GdalInfoError);
    });

    it('should throw gdal info error - Unsupported pixel size', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.unsupportedPixelSize;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const invalidGdalInfo = { ...gdalInfoCases.unsupportedPixelSize, fileName };

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(invalidGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported pixel size'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(GdalInfoError);
    });

    it('should throw gdal info error - Unsupported file format', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidValidation.notGpkg;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const invalidGdalInfo = { ...gdalInfoCases.unsupportedFileFormat, fileName };

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(invalidGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported file format'));
      await expect(gdalInfoManager.validateInfoData([invalidGdalInfo])).rejects.toThrow(GdalInfoError);
    });
  });

  describe('getFilesGdalInfoData', () => {
    it('should return gdal info data', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;
      const fileName = fileNames[0];
      const validGdalInfoData = { ...gdalInfoCases.validGdalInfo, fileName };

      jest.spyOn(nodePath, 'join').mockReturnValue(`${sourceMount}/${originDirectory}/${fileName}`);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(validGdalInfoData);
      const getInfoDataSpy = jest.spyOn(GdalInfoManager.prototype, 'getInfoData');

      const result = await gdalInfoManager.getInfoData(originDirectory, fileNames);

      expect(result).toEqual([validGdalInfoData]);

      expect(getInfoDataSpy).toHaveBeenCalledTimes(1);
      expect(getInfoDataSpy).toHaveBeenCalledWith(originDirectory, fileNames);
    });

    it('should throw an GdalError when error occur', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.filesNotExist;

      jest.spyOn(nodePath, 'join').mockReturnValue(`${sourceMount}/${originDirectory}/${fileNames[0]}`);
      jest.spyOn(GdalUtilities.prototype, 'getInfoData').mockRejectedValue(new Error('Unknown Error'));

      await expect(gdalInfoManager.getInfoData(originDirectory, fileNames)).rejects.toThrow(GdalInfoError);
    });
  });
});
