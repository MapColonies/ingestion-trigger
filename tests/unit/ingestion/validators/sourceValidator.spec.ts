import { constants as fsConstants, promises as fsp } from 'node:fs';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { getApp } from '../../../../src/app';
import { GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { configMock } from '../../../mocks/configMock';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

describe('SourceValidator', () => {
  let sourceValidator: SourceValidator;
  let mockGdalInfoManager: GdalInfoManager;
  let mockGpkgManager: GpkgManager;
  let fspAccessSpy: jest.SpyInstance;
  getApp({
    override: [...getTestContainerConfig()],
    useChild: true,
  });

  beforeEach(() => {
    mockGdalInfoManager = { getInfoData: jest.fn, validateInfoData: jest.fn } as unknown as GdalInfoManager;
    mockGpkgManager = { validateGpkgFiles: jest.fn } as unknown as GpkgManager;
    sourceValidator = new SourceValidator(
      jsLogger({ enabled: false }),
      configMock,
      trace.getTracer('testTracer'),
      mockGdalInfoManager,
      mockGpkgManager
    );
    fspAccessSpy = jest.spyOn(fsp, 'access');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFilesExist', () => {
    it('should validate that all files exist', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      fspAccessSpy.mockResolvedValue(undefined);

      await sourceValidator.validateFilesExist(gpkgFilesPath);

      expect(fspAccessSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      gpkgFilesPath.forEach((filePath) => {
        expect(fspAccessSpy).toHaveBeenNthCalledWith(1, filePath, fsConstants.F_OK);
      });
    });

    it('should throw FileNotFoundError when a file does not exist', async () => {
      fspAccessSpy.mockImplementation(async () => Promise.reject());
      const { gpkgFilesPath } = generateInputFiles();

      const promise = sourceValidator.validateFilesExist(gpkgFilesPath);

      await expect(promise).rejects.toThrow(FileNotFoundError);
      expect(fspAccessSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      gpkgFilesPath.forEach((filePath) => {
        expect(fspAccessSpy).toHaveBeenNthCalledWith(1, filePath, fsConstants.F_OK);
      });
    });
  });

  describe('validateGdalInfo', () => {
    it('should succesfully validate gdal info with no errors', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      jest.spyOn(mockGdalInfoManager, 'getInfoData').mockResolvedValue([mockGdalInfoDataWithFile]);
      const gdalInfoValidatorSpy = jest.spyOn(mockGdalInfoManager, 'validateInfoData');

      await expect(sourceValidator.validateGdalInfo(gpkgFilesPath)).resolves.not.toThrow();

      expect(gdalInfoValidatorSpy).toHaveBeenCalledWith([mockGdalInfoDataWithFile]);
      expect(gdalInfoValidatorSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });
  });
});
