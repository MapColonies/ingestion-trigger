import { promises as fsp, constants as fsConstants } from 'node:fs';
import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { GdalInfoValidator } from '../../../../src/ingestion/validators/gdalInfoValidator';
import { fakeIngestionSources } from '../../../mocks/sourcesRequestBody';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';

describe('SourceValidator', () => {
  let sourceValidator: SourceValidator;
  let mockGdalInfoValidator: GdalInfoValidator;
  let mockGpkgManager: GpkgManager;
  let fspAccessSpy: jest.SpyInstance;

  beforeEach(() => {
    mockGdalInfoValidator = { validateInfoData: jest.fn } as unknown as GdalInfoValidator;
    mockGpkgManager = { validateGpkgFiles: jest.fn } as unknown as GpkgManager;
    sourceValidator = new SourceValidator(jsLogger({ enabled: false }), configMock as unknown as IConfig, mockGdalInfoValidator, mockGpkgManager);
    fspAccessSpy = jest.spyOn(fsp, 'access');
    registerDefaultConfig();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFilesExist', () => {
    it('should validate that all files exist', async () => {
      fspAccessSpy.mockResolvedValue(undefined);
      const sourceMount = configMock.get<string>('storageExplorer.layerSourceDir');

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
      const sourceMount = configMock.get<string>('storageExplorer.layerSourceDir');

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
      const gdalInfoValidatorSpy = jest.spyOn(mockGdalInfoValidator, 'validateInfoData').mockResolvedValue(undefined);
      const { originDirectory, fileNames } = fakeIngestionSources.validSources.validInputFiles;

      await sourceValidator.validateGdalInfo(originDirectory, fileNames);

      expect(gdalInfoValidatorSpy).toHaveBeenCalledWith(originDirectory, fileNames);
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
