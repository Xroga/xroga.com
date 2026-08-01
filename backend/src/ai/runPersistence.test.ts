import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

describe('durable swarm run status migration', () => {
  it('accepts runtime and historical states without rewriting audit history', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/20260802000000_swarm_run_runtime_status.sql', import.meta.url),
      'utf8',
    );
    for (const status of [
      'pending',
      'building',
      'completed',
      'failed',
      'running',
      'complete',
      'error',
      'cancelled',
    ]) {
      assert.match(sql, new RegExp(`'${status}'`));
    }
    assert.match(sql, /DROP CONSTRAINT IF EXISTS swarm_runs_status_check/i);
  });
});
