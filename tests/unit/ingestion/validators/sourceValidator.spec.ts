import { constants as fsConstants, promises as fsp } from 'node:fs';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { configMock } from '../../../mocks/configMock';
import { mockGdalInfoDataWithFile } from '../../../mocks/gdalInfoMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

describe('SourceValidator', () => {
  let sourceValidator: SourceValidator;
  const mockGpkgManager = { validateGpkgFiles: jest.fn() } satisfies Partial<GpkgManager>;
  const mockGdalInfoManager = { getInfoData: jest.fn(), validateInfoData: jest.fn() } satisfies Partial<GdalInfoManager>;
  const fspAccessSpy = jest.spyOn(fsp, 'access');

  beforeEach(() => {
    sourceValidator = new SourceValidator(
      jsLogger({ enabled: false }),
      configMock,
      trace.getTracer('testTracer'),
      mockGdalInfoManager as unknown as GdalInfoManager,
      mockGpkgManager as unknown as GpkgManager
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validateGdalInfo', () => {
    it('should succesfully validate gdal info with no errors', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      mockGdalInfoManager.getInfoData.mockResolvedValue([mockGdalInfoDataWithFile]);

      await expect(sourceValidator.validateGdalInfo(gpkgFilesPath)).resolves.not.toThrow();

      expect(mockGdalInfoManager.validateInfoData).toHaveBeenCalledWith([mockGdalInfoDataWithFile]);
      expect(mockGdalInfoManager.validateInfoData).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });
  });

  describe('validateGpkgFiles', () => {
    it('should succesfully validate gpkg with no errors', () => {
      const { gpkgFilesPath } = generateInputFiles();
      mockGpkgManager.validateGpkgFiles.mockReturnValue(undefined);

      const action = () => sourceValidator.validateGpkgFiles(gpkgFilesPath);

      expect(action).not.toThrow();
      expect(mockGpkgManager.validateGpkgFiles).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });

    it('should throw error when gpkg validation fails', () => {
      const { gpkgFilesPath } = generateInputFiles();
      mockGpkgManager.validateGpkgFiles.mockImplementation(() => {
        throw new Error();
      });

      const action = () => sourceValidator.validateGpkgFiles(gpkgFilesPath);

      expect(action).toThrow();
      expect(mockGpkgManager.validateGpkgFiles).toHaveBeenCalledTimes(gpkgFilesPath.length);
    });
  });

  describe('validateFilesExist', () => {
    it('should successfully validate that all files exist', async () => {
      const { gpkgFilesPath } = generateInputFiles();
      fspAccessSpy.mockResolvedValue(undefined);

      const promise = sourceValidator.validateFilesExist(gpkgFilesPath);

      await expect(promise).resolves.not.toThrow();
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
});
