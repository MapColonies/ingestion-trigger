import { urlsArraySchema, ingestionResolutionSchema, inputFilesSchema, newRasterLayerMetadataSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';

export type IngestionNewLayer = z.infer<typeof newLayerSchema>;

export const newLayerSchema = z.object({
  metadata: newRasterLayerMetadataSchema,
  inputFiles: inputFilesSchema,
  ingestionResolution: ingestionResolutionSchema,
  callbackUrls: urlsArraySchema.optional(),
});
