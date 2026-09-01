/**
 * UUID v4 generation using Node.js crypto.
 */

import { randomUUID } from 'node:crypto';
import type { UUID } from '@automation-studio/types';

export function generateUUID(): UUID {
  return randomUUID() as UUID;
}
