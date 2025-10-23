import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { GdalUtilities } from '../../../src/utils/gdal/gdalUtilities';
import { getApp } from '../../../src/app';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../src/utils/validation/schemasValidator';
import { registerDefaultConfig } from '../../mocks/configMock';
import { mockGdalInfoData } from '../../mocks/gdalInfoMock';
import { expectedGdalUtilitiesValues } from '../../mocks/gdalUtilitiesMockData';


let gdalUtilities: GdalUtilities;

describe('gdalUtilities', () => {
  beforeEach(function () {
    const [, container] = getApp();
    const schemasValidator = container.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
    jest.resetAllMocks();
    gdalUtilities = new GdalUtilities(jsLogger({ enabled: false }), trace.getTracer('testTracer'), schemasValidator);
    registerDefaultConfig();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getInfoData', () => {
    it.only('should extract CRS, fileFormat, pixelSize and footprint from gpkg file', async () => {
      const filePath = 'tests/mocks/testFiles/validIndexed.gpkg';
      const result = await gdalUtilities.getInfoData(filePath);
      const expected = mockGdalInfoData;
      expect(result).toStrictEqual(expected);
    });

    //Added this test to make sure that pixelSize is not a rounded number but the exact number resolution
    it('should extract CRS, fileFormat, pixelSize and footprint from gpkg file with zoom level 21', async () => {
      const filePath = 'tests/mocks/testFiles/zoom21.gpkg';
      const result = await gdalUtilities.getInfoData(filePath);
      const expected = expectedGdalUtilitiesValues.validResponseZoom21;
      expect(result).toStrictEqual(expected);
    });

    it('should throw error when fails to create dataset', async () => {
      const filePath = 'tests/mocks/testFiles/invalidFile.gpkg';
      const action = async () => gdalUtilities.getInfoData(filePath);
      await expect(action).rejects.toThrow(Error);
    });

    it('should throw error when fails to extract data', async () => {
      const filePath = 'tests/mocks/files/unsupportedFormats/world.jp2';
      const action = async () => gdalUtilities.getInfoData(filePath);
      await expect(action).rejects.toThrow(Error);
    });

    //TODO: This test should pass when we have appropriate GDAL version with ECW licence
    it('should throw error when recieves ecw file', async () => {
      const filePath = 'tests/mocks/files/unsupportedFormats/test.ecw';
      const action = async () => gdalUtilities.getInfoData(filePath);
      await expect(action).rejects.toThrow(Error);
    });
  });
});
