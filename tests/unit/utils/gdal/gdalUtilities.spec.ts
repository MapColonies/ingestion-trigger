import jsLogger from '@map-colonies/js-logger';

import { GdalUtilities } from '../../../../src/utils/gdal/gdalUtilities';
import { registerDefaultConfig } from '../../../mocks/configMock';
import { INGESTION_SCHEMAS_VALIDATOR_SYMBOL, SchemasValidator } from '../../../../src/utils/validation/schemasValidator';
import { expectedGdalUtilitiesValues } from '../../../mocks/gdalUtilitiesMockData';
import { getApp } from '../../../../src/app';

let gdalUtilities: GdalUtilities;

describe('gdalUtilities', () => {
  beforeEach(async function () {
    const [, container] = await getApp();
    const schemasValidator = container.resolve<SchemasValidator>(INGESTION_SCHEMAS_VALIDATOR_SYMBOL);
    jest.resetAllMocks();
    gdalUtilities = new GdalUtilities(jsLogger({ enabled: false }), schemasValidator);
    registerDefaultConfig();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getInfoData', () => {
    it('should extract CRS, fileFormat, pixelSize and footprint from gpkg file', async () => {
      const filePath = 'tests/mocks/test_files/(valid)indexed.gpkg';
      const result = await gdalUtilities.getInfoData(filePath);
      const expected = expectedGdalUtilitiesValues.validResponse;
      expect(result).toStrictEqual(expected);
    });

    it('should throw error when fails to create dataset', async () => {
      const filePath = 'tests/mocks/test_files/invalidFile.gpkg';
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
