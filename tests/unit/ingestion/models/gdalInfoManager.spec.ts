import nodePath from 'node:path';
import jsLogger from '@map-colonies/js-logger';
import { BadRequestError } from '@map-colonies/error-types';
import { IConfig } from 'config';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
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
  let sourceMount: string;
  const schemasValidatorMock = {
    validateInfoData: jest.fn(),
  } as unknown as SchemasValidator;

  const gdalUtilitiesMock = {
    getInfoData: jest.fn(),
  } as unknown as GdalUtilities;

  beforeEach(() => {
    const [, container] = getApp({
      override: [...getTestContainerConfig()],
      useChild: true,
    });
    sourceMount = container.resolve<IConfig>(SERVICES.CONFIG).get<string>('storageExplorer.layerSourceDir');
    const schemasValidator = container.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
    gdalInfoManager = new GdalInfoManager(jsLogger({ enabled: false }), configMock as unknown as IConfig, schemasValidator, gdalUtilitiesMock);
    registerDefaultConfig();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validateInfoData', () => {
    it('should validate gdal info data', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const validGdalInfo = gdalInfoCases.validGdalInfo;

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(validGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockResolvedValue(validGdalInfo);

      await expect(gdalInfoManager.validateInfoData(originDirectory, fileNames)).resolves.not.toThrow();
    });

    it('should throw gdal info error - Unsupported CRS', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.unsupportedCrs;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const invalidGdalInfo = gdalInfoCases.unsupportedCrs;

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(invalidGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported CRS'));
      await expect(gdalInfoManager.validateInfoData(originDirectory, fileNames)).rejects.toThrow(GdalInfoError);
    });

    it('should throw gdal info error - Unsupported pixel size', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.unsupportedPixelSize;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const invalidGdalInfo = gdalInfoCases.unsupportedPixelSize;

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(invalidGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported pixel size'));
      await expect(gdalInfoManager.validateInfoData(originDirectory, fileNames)).rejects.toThrow(GdalInfoError);
    });

    it('should throw gdal info error - Unsupported file format', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidValidation.notGpkg;
      const fileName = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${fileName}`;
      const invalidGdalInfo = gdalInfoCases.unsupportedFileFormat;

      jest.spyOn(nodePath, 'join').mockReturnValue(fullPath);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(invalidGdalInfo);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new BadRequestError('Unsupported file format'));
      await expect(gdalInfoManager.validateInfoData(originDirectory, fileNames)).rejects.toThrow(GdalInfoError);
    });
  });

  describe('getFilesGdalInfoData', () => {
    it('should return gdal info data when files are valid', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;
      const validGdalInfoData = gdalInfoCases.validGdalInfo;

      jest.spyOn(nodePath, 'join').mockReturnValue(`${sourceMount}/${originDirectory}/${fileNames[0]}`);
      jest.spyOn(gdalUtilitiesMock, 'getInfoData').mockResolvedValue(validGdalInfoData);
      const validateInfoDataSpy = jest.spyOn(gdalInfoManager, 'validateInfoData').mockResolvedValue([validGdalInfoData]);

      const result = await gdalInfoManager.getFilesGdalInfoData(originDirectory, fileNames);

      expect(validateInfoDataSpy).toHaveBeenCalledTimes(1);
      expect(validateInfoDataSpy).not.toThrow();
      expect(result).toEqual([validGdalInfoData]);
    });

    it('should throw an error when validateInfoData throws BadRequestError', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.unsupportedCrs;

      jest.spyOn(nodePath, 'join').mockReturnValue(`${sourceMount}/${originDirectory}/${fileNames[0]}`);
      jest.spyOn(schemasValidatorMock, 'validateInfoData').mockRejectedValue(new GdalInfoError('Unsupported CRS'));

      await expect(gdalInfoManager.getFilesGdalInfoData(originDirectory, fileNames)).rejects.toThrow(GdalInfoError);
    });
  });
});
