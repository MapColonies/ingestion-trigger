import { polygonSchema, rasterProductTypeSchema, resourceIdSchema, TileOutputFormat, versionSchema } from '@map-colonies/raster-shared';
import { z, type ZodType } from 'zod';
import type { LayerDetails } from '../../common/interfaces';

export const layerDetailsSchema: ZodType<LayerDetails> = z
  .object({
    productId: resourceIdSchema,
    productVersion: versionSchema,
    productType: rasterProductTypeSchema,
    productSubType: z.string(),
    tileOutputFormat: z.nativeEnum(TileOutputFormat),
    displayPath: z.string().uuid(),
    productName: z.string().min(1),
    footprint: polygonSchema,
  })
  .passthrough();
