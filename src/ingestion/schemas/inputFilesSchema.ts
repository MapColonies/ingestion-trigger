/* eslint-disable @typescript-eslint/naming-convention */
import { IConfig } from 'config';
import { z } from 'zod';
import { DependencyContainer } from 'tsyringe';
import { SERVICES } from '../../common/constants';
import { inputFilesSchema } from '@map-colonies/mc-model-types';

type inputFiles = z.infer<typeof inputFilesSchema>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInputFilesSchema = (container: DependencyContainer) => {
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const watchDirectory = config.get<string>('storageExplorer.watchDirectory');

  return inputFilesSchema.refine(
    (data: inputFiles) => {
      const isValidOriginDirectory = data.originDirectory !== watchDirectory;
      return isValidOriginDirectory;
    },
    () => ({
      message: `can't be with same name as watch directory: ${watchDirectory}`,
    })
  );
};
