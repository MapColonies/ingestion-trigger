import { featureSchema, multiPolygonSchema, polygonSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';

export type ProductFeatureGeometry = z.infer<typeof productFeatureSchema>;

export const productFeatureSchema = featureSchema(z.union([polygonSchema, multiPolygonSchema]), z.object({}).passthrough())
  .array()
  .length(1, 'product shapefile must contain a single feature')
  .transform((features) => features[0].geometry);
