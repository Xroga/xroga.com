-- Bounded, privacy-safe progress replay for reconnecting workspace clients.
ALTER TABLE public.swarm_runs
  ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_sequence BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.swarm_runs.events IS
  'Bounded factual run progress events used to reconnect a user-owned workspace.';
COMMENT ON COLUMN public.swarm_runs.last_sequence IS
  'Monotonic sequence for deduplicating replayed run events.';
