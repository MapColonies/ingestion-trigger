import { callbackUrlsArraySchema, CORE_VALIDATIONS } from '@map-colonies/raster-shared';
import { z } from 'zod';
import { createInputFilesSchema } from './inputFilesSchema';
import { createNewMetadataSchema } from './newMetadataSchema';

export type IngestionNewLayer = z.infer<ReturnType<typeof createNewIngestionLayerSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewIngestionLayerSchema = () => {
  return z.object({
    metadata: createNewMetadataSchema(),
    inputFiles: createInputFilesSchema(),
    ingestionResolution: z.number().min(CORE_VALIDATIONS.resolutionDeg.min).max(CORE_VALIDATIONS.resolutionDeg.max),
    callbackUrls: callbackUrlsArraySchema,
  });
};
