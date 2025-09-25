import { callbackUrlsArraySchema, CORE_VALIDATIONS } from '@map-colonies/raster-shared';
import { z } from 'zod';
import { createInputFilesSchema } from './inputFilesSchema';
import { createUpdateMetadataSchema } from './updateMetadataSchema';

export type IngestionUpdateLayer = z.infer<ReturnType<typeof createUpdateLayerSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createUpdateLayerSchema = () => {
  return z.object({
    metadata: createUpdateMetadataSchema(),
    inputFiles: createInputFilesSchema(),
    ingestionResolution: z.number().min(CORE_VALIDATIONS.resolutionDeg.min).max(CORE_VALIDATIONS.resolutionDeg.max),
    callbackUrls: callbackUrlsArraySchema,
  });
};
