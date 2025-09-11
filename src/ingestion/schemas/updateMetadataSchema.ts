import { updateRasterLayerMetadataSchema } from '@map-colonies/raster-shared';
import type z from 'zod';

export type IngestionUpdateMetadata = z.infer<ReturnType<typeof createUpdateMetadataSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createUpdateMetadataSchema = () => {
  return updateRasterLayerMetadataSchema;
};
