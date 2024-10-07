/* eslint-disable @typescript-eslint/naming-convention */
import { z } from 'zod';
import { newMetadataSchema } from '@map-colonies/mc-model-types';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewMetadataSchema = () => {
  return newMetadataSchema;
};
