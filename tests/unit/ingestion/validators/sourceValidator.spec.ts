import { promises as fsp, constants as fsConstants } from 'node:fs';
import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { fakeIngestionSources } from '../../../mocks/sourcesRequestBody';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import { getApp } from '../../../../src/app';
import { SERVICES } from '../../../../src/common/constants';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { InfoDataWithFile } from '../../../../src/ingestion/schemas/infoDataSchema';
import { gdalInfoCases } from '../../../mocks/gdalInfoMock';

describe('SourceValidator', () => {
  let sourceValidator: SourceValidator;
  let mockGdalInfoManager: GdalInfoManager;
  let mockGpkgManager: GpkgManager;
  let fspAccessSpy: jest.SpyInstance;
  const [, container] = getApp({
    override: [...getTestContainerConfig()],
    useChild: true,
  });
  let config: IConfig;

  beforeEach(() => {
    config = container.resolve<IConfig>(SERVICES.CONFIG);
    mockGdalInfoManager = { getInfoData: jest.fn, validateInfoData: jest.fn } as unknown as GdalInfoManager;
    mockGpkgManager = { validateGpkgFiles: jest.fn } as unknown as GpkgManager;
    sourceValidator = new SourceValidator(jsLogger({ enabled: false }), config, mockGdalInfoManager, mockGpkgManager);
    fspAccessSpy = jest.spyOn(fsp, 'access');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFilesExist', () => {
    it('should validate that all files exist', async () => {
      fspAccessSpy.mockResolvedValue(undefined);
      const sourceMount = config.get<string>('storageExplorer.layerSourceDir');

      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;
      const existFile2 = fakeIngestionSources.invalidSources.unsupportedCrs.fileNames[0];
      fileNames.push(existFile2);
      const existFile1 = fileNames[0];
      const fullPath1 = `${sourceMount}/${originDirectory}/${existFile1}`;
      const fullPath2 = `${sourceMount}/${originDirectory}/${existFile2}`;

      await sourceValidator.validateFilesExist(originDirectory, fileNames);

      expect(fspAccessSpy).toHaveBeenCalledTimes(fileNames.length);
      expect(fspAccessSpy).toHaveBeenNthCalledWith(1, fullPath1, fsConstants.F_OK);
      expect(fspAccessSpy).toHaveBeenNthCalledWith(2, fullPath2, fsConstants.F_OK);
    });

    it('should throw FileNotFoundError when a file does not exist', async () => {
      fspAccessSpy.mockImplementation(async () => Promise.reject());
      const sourceMount = config.get<string>('storageExplorer.layerSourceDir');

      const { originDirectory, fileNames } = fakeIngestionSources.invalidSources.filesNotExist;
      const notExistFile1 = fileNames[0];
      const fullPath = `${sourceMount}/${originDirectory}/${notExistFile1}`;

      await expect(sourceValidator.validateFilesExist(originDirectory, fileNames)).rejects.toThrow(FileNotFoundError);
      expect(fspAccessSpy).toHaveBeenCalledTimes(fileNames.length);
      expect(fspAccessSpy).toHaveBeenCalledWith(fullPath, fsConstants.F_OK);
    });
  });

  describe('validateGdalInfo', () => {
    it('should validate gdal info', async () => {
      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;
      const fileName = fileNames[0];
      const validGdalInfo: InfoDataWithFile = { ...gdalInfoCases.validGdalInfo, fileName };

      jest.spyOn(mockGdalInfoManager, 'getInfoData').mockResolvedValue([validGdalInfo]);
      const gdalInfoValidatorSpy = jest.spyOn(mockGdalInfoManager, 'validateInfoData');

      await expect(sourceValidator.validateGdalInfo(originDirectory, fileNames)).resolves.not.toThrow();
      expect(gdalInfoValidatorSpy).toHaveBeenCalledWith([validGdalInfo]);
    });
  });

  describe('validateGpkgFiles', () => {
    it('should validate gpkg files', () => {
      const gpkgManagerSpy = jest.spyOn(mockGpkgManager, 'validateGpkgFiles').mockReturnValue(undefined);
      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;

      sourceValidator.validateGpkgFiles(originDirectory, fileNames);

      expect(gpkgManagerSpy).toHaveBeenCalledWith(originDirectory, fileNames);
    });
  });
});
