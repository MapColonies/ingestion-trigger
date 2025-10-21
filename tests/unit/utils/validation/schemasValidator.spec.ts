import { BadRequestError } from '@map-colonies/error-types';
import jsLogger from '@map-colonies/js-logger';
import { Transparency } from '@map-colonies/mc-model-types';
import { RasterProductTypes } from '@map-colonies/raster-shared';
import { IConfig } from 'config';
import { DependencyContainer } from 'tsyringe';
import { getApp } from '../../../../src/app';
import { SERVICES } from '../../../../src/common/constants';
import { pixelSizeRange } from '../../../../src/ingestion/schemas/infoDataSchema';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { fakeDataToValidate, mockMetadata, mockPart } from '../../../mocks/schemasValidatorMockData';
import {
  CLASSIFICATION_REGEX,
  GPKG_REGEX,
  horizontalAccuracyCE90Range,
  PRODUCT_ID_REGEX,
  resolutionDegRange,
  resolutionMeterRange,
} from '../../../utils/constants';
import { mockInputFiles } from '../../../mocks/sourcesRequestBody';
import { mockGdalInfoData } from '../../../mocks/gdalInfoMock';
import { createNewLayerRequest } from '../../../utils/faker';
import { ingestionNewRequest, validNewLayerRequest } from '../../../mocks/newIngestionRequestMockData';

let schemasValidator: SchemasValidator;
let appContainer: DependencyContainer;

describe('SchemasValidator', () => {
  beforeEach(function () {
    const [, container] = getApp({
      override: [{ token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } }],
    });
    appContainer = container;
    schemasValidator = appContainer.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });


  describe('validateInputFilesRequestBody', () => {
    it('should return valid inputFiles', async () => {
      const result = await schemasValidator.validateInputFilesRequestBody(mockInputFiles);

      expect(result).toHaveProperty('gpkgFilesPath');
      expect(Array.isArray(result.gpkgFilesPath)).toBe(true);
      expect(result.gpkgFilesPath).toHaveLength(1);
      expect(result.gpkgFilesPath[0]).toMatch(GPKG_REGEX);
      expect(result).toHaveProperty('metadataShapefilePath');
      expect(typeof result.metadataShapefilePath).toBe('string');
      expect(result).toHaveProperty('productShapefilePath');
      expect(typeof result.productShapefilePath).toBe('string');
    });

    it('should throw an error when missing gpkgFilesPath within inputFiles request', async () => {
      const { gpkgFilesPath, ...requestBody } = mockInputFiles;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when missing metadataShapefilePath within inputFiles request', async () => {
      const { metadataShapefilePath, ...requestBody } = mockInputFiles;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when missing productShapefilePath within inputFiles request', async () => {
      const { productShapefilePath, ...requestBody } = mockInputFiles;

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error an when provided gpkgFilesPath contains more than one filePath', async () => {
      const requestBody = { ...mockInputFiles, gpkgFilesPath: ['/mock/filePath.gpkg', '/mock/filePath2.gpkg'] };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided gpkgFilesPath has no prefix', async () => {
      const requestBody = { ...mockInputFiles, gpkgFilesPath: ['mock/filePath.gpkg'] };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided metadataShapefilePath has no prefix', async () => {
      const requestBody = { ...mockInputFiles, metadataShapefilePath: 'mock/ShapeMetadata.shp' };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided productShapefilePath has no prefix', async () => {
      const requestBody = { ...mockInputFiles, productShapefilePath: 'mock/Product.shp' };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided gpkgFilesPath does not followed by dir', async () => {
      const requestBody = { ...mockInputFiles, gpkgFilesPath: ['/filePath.gpkg'] };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided metadataShapefilePath does not followed by dir', async () => {
      const requestBody = { ...mockInputFiles, metadataShapefilePath: '/ShapeMetadata.shp' };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided productShapefilePath does not followed by dir', async () => {
      const requestBody = { ...mockInputFiles, productShapefilePath: '/Product.shp' };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided metadataShapefilePath file name is invalid', async () => {
      const requestBody = { ...mockInputFiles, metadataShapefilePath: '/InvalidFileName.shp' };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw an error when provided productShapefilePath file name is invalid', async () => {
      const requestBody = { ...mockInputFiles, productShapefilePath: '/InvalidFileName.shp' };

      const validationAction = async () => schemasValidator.validateInputFilesRequestBody(requestBody);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  // });

  describe('validateInfoData', () => {
    it('should return valid Info Data', async () => {
      const config = appContainer.resolve<IConfig>(SERVICES.CONFIG);
      const validCRSs = config.get<number[]>('validationValuesByInfo.crs');
      const validFormats = config.get<string[]>('validationValuesByInfo.fileFormat').map((format) => format.toLowerCase());

      const result = await schemasValidator.validateInfoData(mockGdalInfoData);

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

    it('should throw an error when fails validate info data - Unsupported CRS', async () => {
      const invalidGdalInfo = { ...mockGdalInfoData, crs: 3857 }

      const validationAction = async () => schemasValidator.validateInfoData(invalidGdalInfo);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });

    it('should throw error when fails validate input files - Unsupported Format', async () => {
      const invalidGdalInfo = { ...mockGdalInfoData, fileFormat: 'TIFF'};

      const validationAction = async () => schemasValidator.validateInfoData(invalidGdalInfo);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
    
    it('should throw error when fails validate input files - Unsupported pixel size', async () => {
      const invalidGdalInfo = { ...mockGdalInfoData, pixelSize: 0.9};

      const validationAction = async () => schemasValidator.validateInfoData(invalidGdalInfo);

      await expect(validationAction).rejects.toThrow(BadRequestError);
    });
  });
});

  // describe('validateNewLayerRequest', () => {
  //   it.only('should return valid new layer request', async () => {
  //     //const layerRequest = fakeDataToValidate.newLayerRequest.valid;
  //     const newLayerRequest = ingestionNewRequest;

  //     const result = await schemasValidator.validateNewLayerRequest(ingestionNewRequest);

  //     expect(result).toHaveProperty('metadata');
  //     expect(result).toHaveProperty('inputFiles');
  //     expect(result).toHaveProperty('ingestionResolution');
  //   });

    //   it('should throw error on invalid new layer request when metadata is invalid', async () => {
    //     const layerRequest = {
    //       metadata: fakeDataToValidate.newLayerRequest.invalid.metadata,
    //       partsData: fakeDataToValidate.newLayerRequest.valid.partsData,
    //       inputFiles: fakeDataToValidate.inputFiles.valid,
    //     };

    //     const validationAction = async () => schemasValidator.validateNewLayerRequest(layerRequest);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });

    //   it('should throw error on invalid new layer request when partsData is invalid', async () => {
    //     const layerRequest = {
    //       metadata: fakeDataToValidate.newLayerRequest.valid.metadata,
    //       partsData: fakeDataToValidate.newLayerRequest.invalid.partsData,
    //       inputFiles: fakeDataToValidate.inputFiles.valid,
    //     };

    //     const validationAction = async () => schemasValidator.validateNewLayerRequest(layerRequest);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });

    //   it('should throw error on invalid new layer request when inputFiles is invalid', async () => {
    //     const layerRequest = {
    //       metadata: fakeDataToValidate.newLayerRequest.valid.metadata,
    //       partsData: fakeDataToValidate.newLayerRequest.valid.partsData,
    //       inputFiles: fakeDataToValidate.inputFiles.invalid.filesNotSupplied,
    //     };

    //     const validationAction = async () => schemasValidator.validateNewLayerRequest(layerRequest);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });
    // });

    // describe('validateNewMetadataSchema', () => {
    //   it('should return valid new metadata schema', async () => {
    //     const validMetadata = fakeDataToValidate.newLayerRequest.valid.metadata;
    //     const result = await schemasValidator.validateNewMetadata(validMetadata);

    //     expect(result).toHaveProperty('productId');
    //     expect(result.productId).toMatch(PRODUCT_ID_REGEX);
    //     expect(result).toHaveProperty('productName');
    //     expect(typeof result.productName).toBe('string');
    //     expect(result).toHaveProperty('productType');
    //     expect(Object.values(RasterProductTypes)).toContain(result.productType);
    //     expect(result).toHaveProperty('srs');
    //     expect(result.srs).toBe('4326');
    //     expect(result).toHaveProperty('srsName');
    //     expect(result.srsName).toBe('WGS84GEO');
    //     expect(result).toHaveProperty('transparency');
    //     expect(Object.values(Transparency)).toContain(result.transparency);
    //     expect(result).toHaveProperty('region');
    //     expect(Array.isArray(result.region)).toBe(true);
    //     expect(result).toHaveProperty('classification');
    //     expect(result.classification).toMatch(CLASSIFICATION_REGEX);
    //   });
    //   it.each(Object.keys(mockMetadata) as (keyof typeof mockMetadata)[])(
    //     'should throw error when given invalid value in %p attribute',
    //     async (attribute) => {
    //       const { invalid } = mockMetadata[attribute];
    //       const invalidMetadata = {
    //         ...fakeDataToValidate.newLayerRequest.valid.metadata,
    //         [attribute]: invalid,
    //       };
    //       const validationAction = async () => schemasValidator.validateNewMetadata(invalidMetadata);
    //       await expect(validationAction).rejects.toThrow(BadRequestError);
    //     }
    //   );
    // });

    // describe('validatepartsDataSchema', () => {
    //   it('should return valid partsData schema', async () => {
    //     const validpartsData = fakeDataToValidate.newLayerRequest.valid.partsData;
    //     const result = await schemasValidator.validatepartsData(validpartsData);

    //     expect(Array.isArray(result)).toBe(true);
    //     expect(result[0]).toHaveProperty('sourceId');
    //     expect(result[0]).toHaveProperty('sourceName');
    //     expect(typeof result[0].sourceName).toBe('string');
    //     expect(result[0].sourceName).not.toHaveLength(0);
    //     expect(result[0]).toHaveProperty('imagingTimeBeginUTC');
    //     expect(result[0].imagingTimeBeginUTC).toBeInstanceOf(Date);
    //     expect(result[0]).toHaveProperty('imagingTimeEndUTC');
    //     expect(result[0].imagingTimeEndUTC).toBeInstanceOf(Date);
    //     expect(result[0]).toHaveProperty('resolutionDegree');
    //     expect(typeof result[0].resolutionDegree).toBe('number');
    //     expect(result[0].resolutionDegree).toBeGreaterThanOrEqual(resolutionDegRange.min as number);
    //     expect(result[0].resolutionDegree).toBeLessThanOrEqual(resolutionDegRange.max as number);
    //     expect(result[0]).toHaveProperty('resolutionMeter');
    //     expect(typeof result[0].resolutionMeter).toBe('number');
    //     expect(result[0].resolutionMeter).toBeGreaterThanOrEqual(resolutionMeterRange.min as number);
    //     expect(result[0].resolutionMeter).toBeLessThanOrEqual(resolutionMeterRange.max as number);
    //     expect(result[0]).toHaveProperty('sourceResolutionMeter');
    //     expect(typeof result[0].sourceResolutionMeter).toBe('number');
    //     expect(result[0].sourceResolutionMeter).toBeGreaterThanOrEqual(resolutionMeterRange.min as number);
    //     expect(result[0].sourceResolutionMeter).toBeLessThanOrEqual(resolutionMeterRange.max as number);
    //     expect(result[0]).toHaveProperty('horizontalAccuracyCE90');
    //     expect(typeof result[0].horizontalAccuracyCE90).toBe('number');
    //     expect(result[0].horizontalAccuracyCE90).toBeGreaterThanOrEqual(horizontalAccuracyCE90Range.min);
    //     expect(result[0].horizontalAccuracyCE90).toBeLessThanOrEqual(horizontalAccuracyCE90Range.max);
    //     expect(result[0]).toHaveProperty('sensors');
    //     expect(Array.isArray(result[0].sensors)).toBe(true);
    //     expect(result[0]).toHaveProperty('footprint');
    //     expect(typeof result[0].footprint).toBe('object');
    //     expect(result[0].footprint).toHaveProperty('type');
    //     expect(result[0].footprint).toHaveProperty('coordinates');
    //   });

    //   it.each(
    //     Object.keys(fakeDataToValidate.newLayerRequest.valid.partsData[0]) as (keyof (typeof fakeDataToValidate.newLayerRequest.valid.partsData)[0])[]
    //   )('should throw error when given invalid value in %p attribute', async (attribute) => {
    //     const { invalid } = mockPart[attribute];
    //     const invalidPart = [
    //       {
    //         ...fakeDataToValidate.newLayerRequest.valid.partsData[0],
    //         [attribute]: invalid,
    //       },
    //     ];
    //     const validationAction = async () => schemasValidator.validatepartsData(invalidPart);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });

    //   it('should throw error when imagingTimeBeginUTC is after presentTime', async () => {
    //     const invalidpartsData = fakeDataToValidate.newLayerRequest.valid.partsData;
    //     invalidpartsData[0]['imagingTimeBeginUTC'] = new Date(Date.UTC(2099, 12, 24, 22, 22, 22));
    //     const validationAction = async () => schemasValidator.validatepartsData(invalidpartsData);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });

    //   it('should throw error when imagingTimeEndUTC is after presentTime', async () => {
    //     const invalidpartsData = fakeDataToValidate.newLayerRequest.valid.partsData;
    //     invalidpartsData[0]['imagingTimeEndUTC'] = new Date(Date.UTC(2099, 12, 24, 22, 22, 22));
    //     const validationAction = async () => schemasValidator.validatepartsData(invalidpartsData);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });

    //   it('should throw error when footprint is an empty object', async () => {
    //     const invalidpartsData = fakeDataToValidate.newLayerRequest.emptyGeometry;

    //     const validationAction = async () => schemasValidator.validatepartsData(invalidpartsData);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });
    // });

    // describe('validateUpdateMetadataSchema', () => {
    //   it('should return valid update metadata schema', async () => {
    //     const validMetadata = fakeDataToValidate.updateLayerRequest.valid.metadata;
    //     const result = await schemasValidator.validateUpdateMetadata(validMetadata);
    //     expect(result).toHaveProperty('classification');
    //     expect(result.classification).toMatch(CLASSIFICATION_REGEX);
    //   });

    //   it('should throw error when given invalid update metadata', async () => {
    //     const invalidMetadata = fakeDataToValidate.updateLayerRequest.invalid.metadata;

    //     const validationAction = async () => schemasValidator.validateUpdateMetadata(invalidMetadata);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });
    // });

    // describe('validateUpdateLayerRequest', () => {
    //   it('should return valid update layer request', async () => {
    //     const updateLayerRequest = fakeDataToValidate.updateLayerRequest.valid;
    //     const result = await schemasValidator.validateUpdateLayerRequest(updateLayerRequest);

    //     expect(result).toHaveProperty('metadata');
    //     expect(result).toHaveProperty('partsData');
    //     expect(result).toHaveProperty('inputFiles');
    //   });

    //   it('should throw error on invalid update layer request when metadata is invalid', async () => {
    //     const layerRequest = {
    //       metadata: fakeDataToValidate.updateLayerRequest.invalid.metadata,
    //       partsData: fakeDataToValidate.updateLayerRequest.valid.partsData,
    //       inputFiles: fakeDataToValidate.inputFiles.valid,
    //     };

    //     const validationAction = async () => schemasValidator.validateUpdateLayerRequest(layerRequest);
    //     await expect(validationAction).rejects.toThrow(BadRequestError);
    //   });
  // });
});
