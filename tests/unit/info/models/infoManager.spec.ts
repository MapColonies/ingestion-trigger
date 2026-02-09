import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { container } from 'tsyringe';
import { NotFoundError } from '@map-colonies/error-types';
import { GdalInfoManager } from '../../../../src/info/models/gdalInfoManager';
import { InfoManager } from '../../../../src/info/models/infoManager';
import { FileNotFoundError, GdalInfoError } from '../../../../src/ingestion/errors/ingestionErrors';
import { SourceValidator } from '../../../../src/ingestion/validators/sourceValidator';
import { configMock, registerDefaultConfig } from '../../../mocks/configMock';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { generateInputFiles } from '../../../mocks/mockFactory';

const sourceValidator = {
  validateFilesExist: jest.fn(),
} satisfies Partial<SourceValidator>;

const gdalInfoManagerMock = {
  getInfoData: jest.fn(),
  validateInfoData: jest.fn(),
} satisfies Partial<GdalInfoManager>;

describe('InfoManager', () => {
  let infoManager: InfoManager;
  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    registerDefaultConfig();
    infoManager = new InfoManager(
      testLogger,
      configMock,
      testTracer,
      sourceValidator as unknown as SourceValidator,
      gdalInfoManagerMock as unknown as GdalInfoManager
    );
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

  describe('getGpkgsInfo', () => {
    it('should return gdal info data when files exist and are valid', async () => {
      const mockGdalInfoDataArr = [mockGdalInfoData];
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockResolvedValue(mockGdalInfoDataArr);

      const result = await infoManager.getGpkgsInfo(generateInputFiles());

      expect(result).toEqual(mockGdalInfoDataArr);
    });

    it('should throw an file not found error if file is not exist', async () => {
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(generateInputFiles().gpkgFilesPath[0]));

      await expect(infoManager.getGpkgsInfo(generateInputFiles())).rejects.toThrow(NotFoundError);
    });

    it('should throw an error when getInfoData throws GdalInfoError', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while getting gdal info')));

      await expect(infoManager.getGpkgsInfo(generateInputFiles())).rejects.toThrow(GdalInfoError);
    });
  });
});
