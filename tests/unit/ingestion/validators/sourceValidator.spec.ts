import { promises as fsp, constants as fsConstants } from 'node:fs';
import jsLogger from '@map-colonies/js-logger';
import { IConfig } from 'config';
import { trace } from '@opentelemetry/api';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { GpkgManager } from '../../../../src/ingestion/models/gpkgManager';
import { GdalInfoManager } from '../../../../src/ingestion/models/gdalInfoManager';
import { fakeIngestionSources, mockInputFiles } from '../../../mocks/sourcesRequestBody';
import { FileNotFoundError } from '../../../../src/ingestion/errors/ingestionErrors';
import { getApp } from '../../../../src/app';
import { SERVICES } from '../../../../src/common/constants';
import { getTestContainerConfig } from '../../../integration/ingestion/helpers/containerConfig';
import { InfoDataWithFile } from '../../../../src/ingestion/schemas/infoDataSchema';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { join } from 'node:path';
import { NotFoundError } from '@map-colonies/error-types';

describe('SourceValidator', () => {
  let sourceValidator: SourceValidator;
  let mockGdalInfoManager: GdalInfoManager;
  let mockGpkgManager: GpkgManager;
  let fspAccessSpy: jest.SpyInstance;
  const [, container] = getApp({
    override: [...getTestContainerConfig()],
    useChild: true,
  });
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const sourceMount = config.get<string>('storageExplorer.layerSourceDir');

  beforeEach(() => {
    mockGdalInfoManager = { getInfoData: jest.fn, validateInfoData: jest.fn } as unknown as GdalInfoManager;
    mockGpkgManager = { validateGpkgFiles: jest.fn } as unknown as GpkgManager;
    sourceValidator = new SourceValidator(jsLogger({ enabled: false }), config, trace.getTracer('testTracer'), mockGdalInfoManager, mockGpkgManager);
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
      gpkgFilesPath.forEach((filePath, index) => {
        expect(fspAccessSpy).toHaveBeenNthCalledWith(index + 1, join(sourceMount, filePath), fsConstants.F_OK);
      });
    });

    it('should throw FileNotFoundError when a file does not exist', async () => {
      fspAccessSpy.mockImplementation(async () => Promise.reject());
      const { gpkgFilesPath } = mockInputFiles;
      const action = async () => sourceValidator.validateFilesExist(gpkgFilesPath);

      expect(action()).rejects.toThrow(FileNotFoundError);
      expect(fspAccessSpy).toHaveBeenCalledTimes(gpkgFilesPath.length);
      gpkgFilesPath.forEach((filePath, index) => {
        expect(fspAccessSpy).toHaveBeenNthCalledWith(index + 1, join(sourceMount, filePath), fsConstants.F_OK);
      });
    });
  });

  describe('validateGdalInfo', () => {
    it('should succesfully validate gdal info with no errors', async () => {
      const { gpkgFilesPath } = mockInputFiles;

      jest.spyOn(mockGdalInfoManager, 'getInfoData').mockResolvedValue([mockGdalInfoData]);
      const gdalInfoValidatorSpy = jest.spyOn(mockGdalInfoManager, 'validateInfoData');

      await expect(sourceValidator.validateGdalInfo(gpkgFilesPath)).resolves.not.toThrow();

      expect(gdalInfoValidatorSpy).toHaveBeenCalledWith([mockGdalInfoData]);
      expect(gdalInfoValidatorSpy).toHaveBeenCalledTimes(gpkgFilesPath.length)
    });
  })
});