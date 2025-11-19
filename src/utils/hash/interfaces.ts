import z from 'zod';
import { HASH_ALGORITHMS } from './constants';

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
 * Interface describing a checksum processor instance.
 * Provides a consistent API for calculating checksums.
 */
export interface ChecksumProcessor extends HashProcessor {
  /**
   * Hashing algorithm used by the processor
   */
  algorithm: HashAlgorithm;
}
