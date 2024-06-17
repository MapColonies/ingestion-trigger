import { z } from 'zod';
import { DependencyContainer } from 'tsyringe';
import { createNewMetadataSchema } from './newMetadataSchema';
import { createPartDataSchema } from './partDataSchema';
import { createInputFilesSchema } from './inputFilesSchema';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createNewIngestionLayerSchema = (container: DependencyContainer) => {
  return z.object({
    metadata: createNewMetadataSchema(),
    partData: createPartDataSchema(),
    inputFiles: createInputFilesSchema(container),
  });
};
