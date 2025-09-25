import { getMapServingLayerName, RasterProductTypes } from '@map-colonies/raster-shared';
import { init as initMockConfig } from '../../mocks/configMock';

describe('layerNameGenerator', () => {
  beforeEach(function () {
    jest.resetAllMocks();
    initMockConfig();
  });

  describe('check map serving layer names generation', () => {
    it('Check layer with product type "Orthophoto"', function () {
      const productId = 'id';
      const layerName = getMapServingLayerName(productId, RasterProductTypes.ORTHOPHOTO);
      expect(layerName).toBe(`${productId}-${RasterProductTypes.ORTHOPHOTO}`);
    });

    it('Check layer with all other product types (Not "Orthophoto")', function () {
      const productId = 'id';
      const valuesNoOrtho = Object.values(RasterProductTypes).filter((value) => value !== RasterProductTypes.ORTHOPHOTO);
      for (let i = 0; i < valuesNoOrtho.length; i++) {
        const layerName = getMapServingLayerName(productId, valuesNoOrtho[i]);
        expect(layerName).toBe(`${productId}-${valuesNoOrtho[i]}`);
      }
    });
  });
});
