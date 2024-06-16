import { ProductType } from '@map-colonies/mc-model-types';
import { getMapServingLayerName } from '../../../src/utils/layerNameGenerator';
import { init as initMockConfig } from '../../mocks/configMock';

describe('layerNameGenerator', () => {
  beforeEach(function () {
    jest.resetAllMocks();
    initMockConfig();
  });

  describe('check map serving layer names generation', () => {
    it('Check layer with product type "Orthophoto"', function () {
      const productId = 'id';
      const layerName = getMapServingLayerName(productId, ProductType.ORTHOPHOTO);
      expect(layerName).toBe(`${productId}-${ProductType.ORTHOPHOTO}`);
    });

    it('Check layer with all other product types (Not "Orthophoto")', function () {
      const productId = 'id';
      const valuesNoOrtho = Object.values(ProductType).filter((value) => value !== ProductType.ORTHOPHOTO) as ProductType[];
      for (let i = 0; i < valuesNoOrtho.length; i++) {
        const layerName = getMapServingLayerName(productId, valuesNoOrtho[i]);
        expect(layerName).toBe(`${productId}-${valuesNoOrtho[i]}`);
      }
    });
  });
});
