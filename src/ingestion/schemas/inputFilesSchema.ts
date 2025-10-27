import { inputFilesSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';
import { gpkgInputFilesSchema } from '../interfaces';

export type InputFiles = z.infer<ReturnType<typeof createInputFilesSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInputFilesSchema = () => {
  return inputFilesSchema;
};

export const createGpkgInputFilesSchema = () => {
  return gpkgInputFilesSchema;
};
