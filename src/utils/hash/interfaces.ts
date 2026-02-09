import { HashAlgorithm } from '@map-colonies/raster-shared';

/**
 * Interface describing a hash processor instance.
 * It is designed to be compatible with various hashing libraries.
 */
interface HashProcessor {
  /**
   * Updates the hash content with a chunk of data
   * @param data - Data to include in the hash calculation
   * @returns Hash calculator instance for chaining
   */
  update: (data: string | Uint8Array) => HashProcessor;

  /**
   * Finalizes the hash calculation and returns the result
   * @returns Final hash value
   */
  digest: () => bigint;

  /**
   * Optional method to reset the hash calculator state
   */
  reset?: () => void;
}

/**
 * Interface describing a checksum processor instance.
 * Provides a consistent API for calculating checksums.
 */
export interface ChecksumProcessor extends HashProcessor {
  /**
   * Hashing algorithm used by the processor
   */
  algorithm: HashAlgorithm;
}
