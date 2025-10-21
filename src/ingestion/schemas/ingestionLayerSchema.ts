import { callbackUrlsArraySchema, ingestionResolutionSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';
import { createInputFilesSchema } from './inputFilesSchema';
import { createNewMetadataSchema } from './newMetadataSchema';

export type IngestionNewLayer = z.infer<ReturnType<typeof createNewIngestionLayerSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewIngestionLayerSchema = () => {
  return z.object({
    metadata: createNewMetadataSchema(),
    inputFiles: createInputFilesSchema(),
    ingestionResolution: ingestionResolutionSchema,
    callbackUrls: callbackUrlsArraySchema.optional(),
  });
};
