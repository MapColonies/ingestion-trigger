/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';
import { CLASSIFICATION_REGEX } from './constants';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createUpdateMetadataSchema = () => {
  return z
    .object({
      classification: z.string().regex(CLASSIFICATION_REGEX),
    })
    .describe('UpdateRasterLayerMetadata');
};
