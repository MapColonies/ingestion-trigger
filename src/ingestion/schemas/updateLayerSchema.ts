import { callbackUrlsArraySchema, ingestionResolutionSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';
import { createInputFilesSchema } from './inputFilesSchema';
import { createUpdateMetadataSchema } from './updateMetadataSchema';

export type IngestionUpdateLayerRequest = z.infer<ReturnType<typeof createUpdateLayerSchema>>;
export type IngestionUpdateLayer = IngestionUpdateLayerRequest['reqBody'];

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createUpdateLayerSchema = () => {
  return z.object({
    reqBody: z.object({
      metadata: createUpdateMetadataSchema(),
      inputFiles: createInputFilesSchema(),
      ingestionResolution: ingestionResolutionSchema,
      callbackUrls: callbackUrlsArraySchema.optional(),
    }),
    paramsId: z.string().uuid(),
  });
};
