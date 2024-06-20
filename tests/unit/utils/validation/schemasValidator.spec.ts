import { BadRequestError } from '@map-colonies/error-types';
import { IConfig } from 'config';
import { DependencyContainer } from 'tsyringe';
import { ProductType, Transparency } from '@map-colonies/mc-model-types';
import { getApp } from '../../../../src/app';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { fakeDataToValidate, mockMetadata, mockPart } from '../../../mocks/schemasValidatorMockData';
import {
  SERVICES,
  GPKG_REGEX,
  PRODUCT_ID_REGEX,
  CLASSIFICATION_REGEX,
  horizontalAccuracyCE90Range,
  resolutionDegRange,
  resolutionMeterRange,
} from '../../../../src/common/constants';
import { pixelSizeRange } from '../../../../src/ingestion/schemas/infoDataSchema';

let schemasValidator: SchemasValidator;
let appContainer: DependencyContainer;

describe('SchemasValidator', () => {
  beforeEach(function () {
    const [, container] = getApp();
    appContainer = container;
    schemasValidator = appContainer.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validateInputFilesRequestBody', () => {
    it('should return valid inputFiles', async () => {
      const requestBody = fakeDataToValidate.inputFiles.valid;

      const result = await schemasValidator.validateInputFilesRequestBody(requestBody);

      expect(result).toHaveProperty('originDirectory');
      expect(typeof result.originDirectory).toBe('string');
      expect(result).toHaveProperty('fileNames');
      expect(Array.isArray(result.fileNames)).toBe(true);
      expect(result.fileNames).toHaveLength(1);
      expect(result.fileNames[0]).toMatch(GPKG_REGEX);
    });

    it('should throw error when fails validate input files- Directory Not Supplied', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.directoryNotSupplied;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Files Not Supplied', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.filesNotSupplied;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Too Many Files', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.tooManyFiles;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Wrong Suffix', async () => {
      const requestBody = fakeDataToValidate.inputFiles.invalid.wrongSuffix;
      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });

  describe('validateInfoData', () => {
    it('should return valid Info Data', async () => {
      const infoData = fakeDataToValidate.infoData.valid;

      const config = appContainer.resolve<IConfig>(SERVICES.CONFIG);
      const validCRSs = config.get<number[]>('validationValuesByInfo.crs');
      const validFormats = config.get<string[]>('validationValuesByInfo.fileFormat').map((format) => format.toLowerCase());

      const result = await schemasValidator.validateInfoData(infoData);

      expect(result).toHaveProperty('crs');
      expect(typeof result.crs).toBe('number');
      expect(validCRSs).toContain(result.crs);
      expect(result).toHaveProperty('fileFormat');
      expect(typeof result.fileFormat).toBe('string');
      expect(validFormats).toContain(result.fileFormat);
      expect(result).toHaveProperty('pixelSize');
      expect(typeof result.pixelSize).toBe('number');
      expect(result.pixelSize).toBeGreaterThanOrEqual(pixelSizeRange.min);
      expect(result.pixelSize).toBeLessThanOrEqual(pixelSizeRange.max);
      expect(result).toHaveProperty('extentPolygon');
      expect(typeof result.extentPolygon).toBe('object');
    });

    it('should throw error when fails validate info data- Unsupported CRS', async () => {
      const infoData = fakeDataToValidate.infoData.invalid.invalidCrs;

      const validationAction = async () => schemasValidator.validateInfoData(infoData);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Unsupported Format', async () => {
      const infoData = fakeDataToValidate.infoData.invalid.invalidFileFormat;

      const validationAction = async () => schemasValidator.validateInfoData(infoData);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files- Unsupported pixel size', async () => {
      const infoData = fakeDataToValidate.infoData.invalid.invalidPixelSize;

      const validationAction = async () => schemasValidator.validateInfoData(infoData);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });

  describe('validateNewLayerRequest', () => {
    it('should return valid new layer request', async () => {
      const layerRequest = fakeDataToValidate.newLayerRequest.valid;

      const result = await schemasValidator.validateNewLayerRequest(layerRequest);

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('partData');
      expect(result).toHaveProperty('inputFiles');
    });

    it('should throw error on invalid new layer request when metadata is invalid', async () => {
      const layerRequest = {
        metadata: fakeDataToValidate.newLayerRequest.invalid.metadata,
        partdata: fakeDataToValidate.newLayerRequest.valid.partData,
        inputFiles: fakeDataToValidate.inputFiles.valid,
      };

      const validationAction = async () => schemasValidator.validateNewLayerRequest(layerRequest);
      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error on invalid new layer request when partdata is invalid', async () => {
      const layerRequest = {
        metadata: fakeDataToValidate.newLayerRequest.valid.metadata,
        partdata: fakeDataToValidate.newLayerRequest.invalid.partData,
        inputFiles: fakeDataToValidate.inputFiles.valid,
      };

      const validationAction = async () => schemasValidator.validateNewLayerRequest(layerRequest);
      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error on invalid new layer request when inputFiles is invalid', async () => {
      const layerRequest = {
        metadata: fakeDataToValidate.newLayerRequest.valid.metadata,
        partdata: fakeDataToValidate.newLayerRequest.valid.partData,
        inputFiles: fakeDataToValidate.inputFiles.invalid.filesNotSupplied,
      };

      const validationAction = async () => schemasValidator.validateNewLayerRequest(layerRequest);
      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });

  describe('validateNewMetadataSchema', () => {
    it('should return valid new metadata schema', async () => {
      const validMetadata = fakeDataToValidate.newLayerRequest.valid.metadata;
      const result = await schemasValidator.validateNewMetadata(validMetadata);

      expect(result).toHaveProperty('productId');
      expect(result.productId).toMatch(PRODUCT_ID_REGEX);
      expect(result).toHaveProperty('productName');
      expect(typeof result.productName).toBe('string');
      expect(result).toHaveProperty('productType');
      expect(Object.values(ProductType)).toContain(result.productType);
      expect(result).toHaveProperty('srs');
      expect(result.srs).toBe('4326');
      expect(result).toHaveProperty('srsName');
      expect(result.srsName).toBe('WGS84Geo');
      expect(result).toHaveProperty('transparency');
      expect(Object.values(Transparency)).toContain(result.transparency);
      expect(result).toHaveProperty('region');
      expect(Array.isArray(result.region)).toBe(true);
      expect(result).toHaveProperty('classification');
      expect(result.classification).toMatch(CLASSIFICATION_REGEX);
    });
    it.each(Object.keys(mockMetadata) as (keyof typeof mockMetadata)[])(
      'should throw error when given invalid value in %p attribute',
      async (attribute) => {
        const { invalid } = mockMetadata[attribute];
        const invalidMetadata = {
          ...fakeDataToValidate.newLayerRequest.valid.metadata,
          [attribute]: invalid,
        };
        const validationAction = async () => schemasValidator.validateNewMetadata(invalidMetadata);
        await expect(validationAction).rejects.toThrow(BadRequestError);
      }
    );
  });

  describe('validatePartDataSchema', () => {
    it('should return valid partData schema', async () => {
      const validPartData = fakeDataToValidate.newLayerRequest.valid.partData;
      const result = await schemasValidator.validatePartData(validPartData);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('id');
      expect(result[0].id).toMatch(PRODUCT_ID_REGEX);
      expect(result[0]).toHaveProperty('name');
      expect(typeof result[0].name).toBe('string');
      expect(result[0].name).not.toHaveLength(0);
      expect(result[0]).toHaveProperty('imagingTimeBeginUTC');
      expect(result[0].imagingTimeBeginUTC).toBeInstanceOf(Date);
      expect(result[0]).toHaveProperty('imagingTimeEndUTC');
      expect(result[0].imagingTimeEndUTC).toBeInstanceOf(Date);
      expect(result[0]).toHaveProperty('resolutionDegree');
      expect(typeof result[0].resolutionDegree).toBe('number');
      expect(result[0].resolutionDegree).toBeGreaterThanOrEqual(resolutionDegRange.min as number);
      expect(result[0].resolutionDegree).toBeLessThanOrEqual(resolutionDegRange.max as number);
      expect(result[0]).toHaveProperty('resolutionMeter');
      expect(typeof result[0].resolutionMeter).toBe('number');
      expect(result[0].resolutionMeter).toBeGreaterThanOrEqual(resolutionMeterRange.min as number);
      expect(result[0].resolutionMeter).toBeLessThanOrEqual(resolutionMeterRange.max as number);
      expect(result[0]).toHaveProperty('sourceResolutionMeter');
      expect(typeof result[0].sourceResolutionMeter).toBe('number');
      expect(result[0].sourceResolutionMeter).toBeGreaterThanOrEqual(resolutionMeterRange.min as number);
      expect(result[0].sourceResolutionMeter).toBeLessThanOrEqual(resolutionMeterRange.max as number);
      expect(result[0]).toHaveProperty('horizontalAccuracyCE90');
      expect(typeof result[0].horizontalAccuracyCE90).toBe('number');
      expect(result[0].horizontalAccuracyCE90).toBeGreaterThanOrEqual(horizontalAccuracyCE90Range.min);
      expect(result[0].horizontalAccuracyCE90).toBeLessThanOrEqual(horizontalAccuracyCE90Range.max);
      expect(result[0]).toHaveProperty('sensors');
      expect(Array.isArray(result[0].sensors)).toBe(true);
      expect(result[0]).toHaveProperty('geometry');
      expect(typeof result[0].geometry).toBe('object');
      expect(result[0].geometry).toHaveProperty('type');
      expect(result[0].geometry).toHaveProperty('coordinates');
    });

    it.each(
      Object.keys(fakeDataToValidate.newLayerRequest.valid.partData[0]) as (keyof (typeof fakeDataToValidate.newLayerRequest.valid.partData)[0])[]
    )('should throw error when given invalid value in %p attribute', async (attribute) => {
      const { invalid } = mockPart[attribute];
      const invalidPart = [
        {
          ...fakeDataToValidate.newLayerRequest.valid.partData[0],
          [attribute]: invalid,
        },
      ];
      const validationAction = async () => schemasValidator.validatePartData(invalidPart);
      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });
});
