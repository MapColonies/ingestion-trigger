import type { HashAlgorithm } from './constants';

export interface ShapeReader {
  features: string;
  fileName: string;
}

/**
 * Interface describing a hash processor instance.
 * This interface is designed to be compatible with various hashing libraries
 * while providing a consistent API for calculating checksums.
 */
export interface Unzipper {
  /**
   * Unzip the Product.zip file
   * @param zipFilePath - The path to the source zip file
   * @param destinationPath - the destination path to unzip the content
   */
  unzip: (zipFilePath: string, destinationPath: string) => Promise<void>;

  read: ()

  /**
   * Optional method to reset the features list state
   */
  reset: () => void;
}
