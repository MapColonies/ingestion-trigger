/* eslint-disable @typescript-eslint/naming-convention */
import { IConfig } from 'config';
import { z } from 'zod';
import { DependencyContainer } from 'tsyringe';
import { SERVICES } from '../../common/constants';

export const GPKG_REGEX = new RegExp('^.+.[Gg][Pp][Kk][Gg]$');

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createInputFilesSchema = (container: DependencyContainer) => {
  const config = container.resolve<IConfig>(SERVICES.CONFIG);
  const watchDirectory = config.get<string>('storageExplorer.watchDirectory');

  return z
    .object({
      originDirectory: z
        .string()
        .min(1, { message: 'Origin directory is required, files should be stored on specific directory' })
        .refine((value) => value !== watchDirectory, { message: `can't be with same name as watch directory: ${watchDirectory}` }),
      fileNames: z.array(z.string().regex(GPKG_REGEX, 'File name must end with .gpkg')).length(1, { message: 'Number of files should be 1' }),
    })
    .describe('InputFiles');
};
