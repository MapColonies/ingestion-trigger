/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createUpdateMetadataSchema = () => {
  return z
    .object({
      classification: z.string(),
      description: z.string().optional(),
    })
    .describe('UpdateRasterLayerMetadata');
};
