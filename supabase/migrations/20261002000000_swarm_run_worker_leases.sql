ALTER TABLE public.swarm_runs
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_swarm_runs_active_heartbeat
  ON public.swarm_runs(status, heartbeat_at)
  WHERE status = 'running';

COMMENT ON COLUMN public.swarm_runs.worker_id IS
  'Opaque API worker lease owner for an active run; never exposed to clients.';

COMMENT ON COLUMN public.swarm_runs.heartbeat_at IS
  'Last durable lease heartbeat used to distinguish an orphan from a run owned by another live API worker.';
