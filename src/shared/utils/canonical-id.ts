import { randomUUID } from 'crypto';

/**
 * Generates a canonical UUID v7-compatible ID.
 * For this implementation, we use crypto.randomUUID() which generates v4 UUIDs.
 * Can be upgraded to true v7 implementation in future.
 *
 * @returns A UUID string suitable for use as canonical ID across all domain entities
 */
export function createCanonicalId(): string {
  return randomUUID();
}
