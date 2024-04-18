/* eslint-disable @typescript-eslint/naming-convention */
import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import { join } from 'node:path';
import config from 'config';
import { z } from 'zod';

const GPKG_REGEX = new RegExp('^.+.[Gg][Pp][Kk][Gg]$');

const validateFilesExists = async (srcDir: string, files: string[]): Promise<boolean> => {
  const sourceMount = config.get<string>('storageExplorer.layerSourceDir');
  const filePromises = files.map(async (file) => {
    const fullPath = join(sourceMount, srcDir, file);
    return fsPromises
      .access(fullPath, fsConstants.F_OK)
      .then(() => true)
      .catch(() => false);
  });
  const allValid = (await Promise.all(filePromises)).every((value) => value);
  return allValid;
};

export const inputFilesSchema = z
  .object({
    originDirectory: z
      .string()
      .min(1, { message: 'Origin directory is required, files should be stored on specific directory' })
      .refine((value) => value !== config.get<string>('storageExplorer.watchDirectory'), `can't be with same name as watch directory`),
    fileNames: z
      .array(z.string().regex(GPKG_REGEX, 'File name must end with .gpkg'))
      .refine((value) => value.length === 1, 'Invalid files list, can contain only one file'),
  })
  .refine(async (value) => {
    const isFilesExist = await validateFilesExists(value.originDirectory, value.fileNames);
    return isFilesExist;
  }, 'Files do not exist')
  .describe('InputFiles');
