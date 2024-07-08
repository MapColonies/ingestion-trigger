import { ProductType } from '@map-colonies/mc-model-types';

export function getMapServingLayerName(productId: string, productType: ProductType): string {
  const layerName = `${productId}-${productType}`;
  return layerName;
}
