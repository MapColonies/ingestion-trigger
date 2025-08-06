/* eslint-disable @typescript-eslint/naming-convention */
import { IConfig } from 'config';
import { z } from 'zod';
import { DependencyContainer } from 'tsyringe';
import { inputFilesSchema } from '@map-colonies/raster-shared';
import { SERVICES } from '../../common/constants';

type inputFiles = z.infer<typeof inputFilesSchema>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInputFilesSchema = () => {
  return inputFilesSchema;
};
