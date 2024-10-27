import { z } from 'zod';
import { DependencyContainer } from 'tsyringe';
import { createPartsDataSchema } from './partsDataSchema';
import { createInputFilesSchema } from './inputFilesSchema';
import { createUpdateMetadataSchema } from './updateMetadataSchema';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createUpdateLayerSchema = (container: DependencyContainer) => {
  return z.object({
    metadata: createUpdateMetadataSchema(),
    partsData: createPartsDataSchema(),
    inputFiles: createInputFilesSchema(container),
  });
};
