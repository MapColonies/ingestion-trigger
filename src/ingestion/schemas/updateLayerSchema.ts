import { urlsArraySchema, ingestionResolutionSchema, inputFilesSchema, updateRasterLayerMetadataSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';

export type IngestionUpdateLayerRequest = z.infer<typeof updateLayerSchema>;
export type IngestionUpdateLayer = IngestionUpdateLayerRequest['reqBody'];

export const updateLayerSchema = z.object({
  reqBody: z.object({
    metadata: updateRasterLayerMetadataSchema,
    inputFiles: inputFilesSchema,
    ingestionResolution: ingestionResolutionSchema,
    callbackUrls: urlsArraySchema.optional(),
  }),
  paramsId: z.string().uuid(),
});
