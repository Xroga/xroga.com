-- Align durable execution status values with the original swarm_runs schema.
-- Legacy values remain valid so historical evidence is not rewritten.
ALTER TABLE public.swarm_runs DROP CONSTRAINT IF EXISTS swarm_runs_status_check;

ALTER TABLE public.swarm_runs
  ADD CONSTRAINT swarm_runs_status_check CHECK (
    status IN (
      'pending',
      'planning',
      'building',
      'reviewing',
      'testing',
      'verifying',
      'completed',
      'failed',
      'running',
      'complete',
      'error',
      'cancelled'
    )
  );

NOTIFY pgrst, 'reload schema';
