import { IConfig } from "config";
import { GDAL_INFO_MANAGER_SYMBOL, GdalInfoManager } from "../../../src/info/models/gdalInfoManager";
import { registerDefaultConfig } from "../../mocks/configMock";
import { mockGdalInfoData } from "../../mocks/gdalInfoMock";
import { SERVICES } from "../../../src/common/constants";
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from "../../../src/utils/validation/schemasValidator";
import { container } from "tsyringe";
import { getApp } from "../../../src/app";
import { getTestContainerConfig } from "../../integration/ingestion/helpers/containerConfig";
import { SourceValidator } from "../../../src/ingestion/validators/sourceValidator";
import { FileNotFoundError, GdalInfoError } from "../../../src/ingestion/errors/ingestionErrors";
import { mockInputFiles } from "../../mocks/sourcesRequestBody";
import { InfoManager } from "../../../src/info/models/infoManager";
import { trace } from "@opentelemetry/api";
import jsLogger from "@map-colonies/js-logger";

const sourceValidator = {
  validateFilesExist: jest.fn(),
};
const gdalInfoManagerMock = {
  getInfoData: jest.fn(),
  validateInfoData: jest.fn(),
};


describe('InfoManager', () => {
  let infoManager: InfoManager;
  let gdalInfoManager: GdalInfoManager;
  let schemaValidator: SchemasValidator;
  let sourceMount: string;

  const testTracer = trace.getTracer('testTracer');
  const testLogger = jsLogger({ enabled: false });

  beforeEach(() => {
    const [, container] = getApp({
      override: [...getTestContainerConfig()],
      useChild: true,
    });
    sourceMount = container.resolve<IConfig>(SERVICES.CONFIG).get<string>('storageExplorer.layerSourceDir');
    schemaValidator = container.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
    gdalInfoManager = container.resolve<GdalInfoManager>(GDAL_INFO_MANAGER_SYMBOL);
    infoManager = new InfoManager(testLogger, testTracer, sourceValidator as unknown as SourceValidator, gdalInfoManagerMock as unknown as GdalInfoManager,)

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

  describe('getGpkgsInfo', () => {
    it('should return gdal info data when files exist and are valid', async () => {
      const mockGdalInfoDataArr = [mockGdalInfoData];
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockResolvedValue(mockGdalInfoDataArr);

      const result = await infoManager.getGpkgsInfo(mockInputFiles);

      expect(result).toEqual(mockGdalInfoDataArr);
    });

    it('should throw an file not found error if file is not exist', async () => {
      //validateFilesExistSpy.mockRejectedValue(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0]));
      sourceValidator.validateFilesExist.mockRejectedValue(new FileNotFoundError(mockInputFiles.gpkgFilesPath[0]));

      await expect(infoManager.getGpkgsInfo(mockInputFiles)).rejects.toThrow(FileNotFoundError);
    });

    it('should throw an error when getInfoData throws GdalInfoError', async () => {
      sourceValidator.validateFilesExist.mockImplementation(async () => Promise.resolve());
      gdalInfoManagerMock.getInfoData.mockImplementation(async () => Promise.reject(new GdalInfoError('Error while getting gdal info')));

      await expect(infoManager.getGpkgsInfo(mockInputFiles)).rejects.toThrow(GdalInfoError);
    });
  });
});
