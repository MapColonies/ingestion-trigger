/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';
import { ProductType, Transparency } from '@map-colonies/mc-model-types';
import { PRODUCT_ID_REGEX, scaleRange, CLASSIFICATION_REGEX } from './constants';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewMetadataSchema = () => {
  return z
    .object({
      productId: z.string().regex(PRODUCT_ID_REGEX),
      productName: z.string().min(1),
      productType: z.nativeEnum(ProductType),
      srs: z.literal('4326'),
      srsName: z.literal('WGS84GEO'),
      transparency: z.nativeEnum(Transparency),
      region: z.array(z.string().min(1)).min(1),
      classification: z.string().regex(CLASSIFICATION_REGEX),
      producerName: z.string().optional(),
      scale: z.number().min(scaleRange.min).max(scaleRange.max).optional(),
      productSubType: z.string().optional(),
      description: z.string().optional(),
    })
    .describe('NewRasterLayerMetadata');
};
