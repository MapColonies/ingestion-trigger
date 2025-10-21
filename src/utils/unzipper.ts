import { createReadStream } from 'fs';
import { Extract } from 'unzipper';

export const unzipFileStream = async (zipFilePath: string, destinationPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    createReadStream(zipFilePath)
      .pipe(Extract({ path: destinationPath }))
      .on('close', () => {
        console.log(`Successfully unzipped ${zipFilePath} to ${destinationPath}`);
        resolve();
      })
      .on('error', (error: Error) => {
        console.error(`Error unzipping file: ${error.message}`);
        reject(error);
      });
  });
};
