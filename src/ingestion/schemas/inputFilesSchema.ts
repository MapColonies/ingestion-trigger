import { inputFilesSchema } from '@map-colonies/raster-shared';
import { z } from 'zod';

export type InputFiles = z.infer<ReturnType<typeof createInputFilesSchema>>;
export type GpkgInputFiles = z.infer<ReturnType<typeof createGpkgInputFilesSchema>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInputFilesSchema = () => {
  return inputFilesSchema;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createGpkgInputFilesSchema = () => {
  return inputFilesSchema.pick({ gpkgFilesPath: true });
};
