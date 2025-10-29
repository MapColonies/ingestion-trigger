import { promises as fsp, constants as fsConstants } from 'node:fs';
import jsLogger from '@map-colonies/js-logger';
import { configMock } from '../../../mocks/configMock';
import { trace } from '@opentelemetry/api';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import { getApp } from '../../../../src/app';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';

describe('SourceValidator', () => {
  let sourceValidator: SourceValidator;
  let mockGdalInfoManager: GdalInfoManager;
  let mockGpkgManager: GpkgManager;
  let fspAccessSpy: jest.SpyInstance;
  const [, container] = getApp({
    override: [...getTestContainerConfig()],
    useChild: true,
  });

  beforeEach(() => {
    mockGdalInfoManager = { getInfoData: jest.fn, validateInfoData: jest.fn } as unknown as GdalInfoManager;
    mockGpkgManager = { validateGpkgFiles: jest.fn } as unknown as GpkgManager;
    sourceValidator = new SourceValidator(jsLogger({ enabled: false }), configMock, trace.getTracer('testTracer'), mockGdalInfoManager, mockGpkgManager);
    fspAccessSpy = jest.spyOn(fsp, 'access');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFilesExist', () => {
    it('should validate that all files exist', async () => {
      const { gpkgFilesPath } = mockInputFiles;

      fspAccessSpy.mockResolvedValue(undefined);

      await sourceValidator.validateFilesExist(gpkgFilesPath);

      expect(fspAccessSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      gpkgFilesPath.forEach((filePath) => {
        expect(fspAccessSpy).toHaveBeenNthCalledWith(1, filePath, fsConstants.F_OK);
      });
    });

    it('should throw FileNotFoundError when a file does not exist', async () => {
      fspAccessSpy.mockImplementation(async () => Promise.reject());
      const { gpkgFilesPath } = mockInputFiles;
      const action = async () => sourceValidator.validateFilesExist(gpkgFilesPath);

      expect(action()).rejects.toThrow(FileNotFoundError);
      expect(fspAccessSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      gpkgFilesPath.forEach((filePath) => {
        expect(fspAccessSpy).toHaveBeenNthCalledWith(1, filePath, fsConstants.F_OK);
      });
    });
  });

  describe('validateGdalInfo', () => {
    it('should succesfully validate gdal info with no errors', async () => {
      const { gpkgFilesPath } = mockInputFiles;

      jest.spyOn(mockGdalInfoManager, 'getInfoData').mockResolvedValue([mockGdalInfoDataWithFile]);
      const gdalInfoValidatorSpy = jest.spyOn(mockGdalInfoManager, 'validateInfoData');

      await expect(sourceValidator.validateGdalInfo(gpkgFilesPath)).resolves.not.toThrow();

      expect(gdalInfoValidatorSpy).toHaveBeenCalledWith([mockGdalInfoDataWithFile]);
      expect(gdalInfoValidatorSpy).toHaveBeenCalledTimes(gpkgFilesPath.length)
    });
  })
});