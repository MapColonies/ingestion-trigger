import { z } from 'zod';
import { DependencyContainer } from 'tsyringe';
import { createNewMetadataSchema } from './newMetadataSchema';
import { createPartsDataSchema } from './partsDataSchema';
import { createInputFilesSchema } from './inputFilesSchema';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewIngestionLayerSchema = () => {
  return z.object({
    metadata: createNewMetadataSchema(),
    partsData: createPartsDataSchema(),
    inputFiles: createInputFilesSchema(),
  });
};
