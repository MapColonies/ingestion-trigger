/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';
import { ProductType, Transparency } from '@map-colonies/mc-model-types';
import { PRODUCT_ID_REGEX, scaleRange } from '../../common/constants';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewMetadataSchema = () => {
  return z
    .object({
      productId: z.string().uuid(),
      productName: z.string(),
      productType: z.nativeEnum(ProductType),
      srs: z.literal('4326'),
      srsName: z.literal('WGS84Geo'),
      transparency: z.nativeEnum(Transparency),
      region: z.array(z.string()).min(1),
      classification: z.string().regex(new RegExp('^[0-9]$|^[1-9][0-9]$|^(100)$')),
      producerName: z.string().optional(),
      scale: z.number().min(scaleRange.min).max(scaleRange.max).optional(),
      productSubType: z.string().optional(),
      description: z.string().optional(),
    })
    .describe('NewRasterLayerMetadata');
};
