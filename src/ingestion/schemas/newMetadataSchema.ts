import { newRasterLayerMetadataSchema } from '@map-colonies/raster-shared';
import type z from 'zod';

export type IngestionNewMetadata = z.infer<ReturnType<typeof createNewMetadataSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewMetadataSchema = () => {
  return newRasterLayerMetadataSchema;
};
