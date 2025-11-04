import { inputFilesSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';
import { gpkgFilesPathSchema } from '../interfaces';

export type InputFiles = z.infer<ReturnType<typeof createInputFilesSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInputFilesSchema = () => {
  return inputFilesSchema;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createGpkgInputFilesSchema = () => {
  return gpkgFilesPathSchema;
}