import z from 'zod';
import { HASH_ALGORITHMS } from './constants';

export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

export interface Checksum {
  algorithm: HashAlgorithm;
  checksum: string;
  fileName: string;
}

export const checksumSchema = z.object({
  algorithm: z.enum(HASH_ALGORITHMS),
  checksum: z.string(),
  fileName: z.string(),
});

/**
 * Interface describing a hash processor instance.
 * This interface is designed to be compatible with various hashing libraries
 * while providing a consistent API for calculating checksums.
 */
export interface HashProcessor {
  /**
   * The hashing algorithm used by the processor
   */
  algorithm?: HashAlgorithm;

  /**
   * Updates the hash content with a chunk of data
   * @param data - The data to include in the hash calculation
   * @returns The hash calculator instance for chaining
   */
  update: (data: string | Uint8Array) => HashProcessor;

  /**
   * Finalizes the hash calculation and returns the result
   * @returns The final hash value
   */
  digest: () => bigint;

  /**
   * Optional method to reset the hash calculator state
   */
  reset?: () => void;
}
