import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Full historical runtime SQL retained only as sanitized upgrade-test input.
// Runtime removal must not erase coverage for databases created by that old code.
export const historicalShareSchema = Object.freeze({
  path: 'scripts/security/fixtures/pre-security-message-shares.sql',
  originalSource: 'backend/src/db/ensureMessageSharesSchema.ts',
  originalCommit: '4472cc0e3fa94eb564abd903d7e3d071546adb25',
  sha256: '4b78f5a994a6170a981dda14a6a22364fbd7b088fe783948bbe74bf53e0d852f',
  canonicalization: 'Extract complete ENSURE_MESSAGE_SHARES_SQL, trim outer whitespace, LF and one final newline',
});

export function readHistoricalShareSchema(read = readFileSync) {
  const sql = read(new URL('./fixtures/pre-security-message-shares.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  if (createHash('sha256').update(sql).digest('hex') !== historicalShareSchema.sha256) {
    throw new Error('Historical share schema fixture integrity mismatch');
  }
  return sql;
}
