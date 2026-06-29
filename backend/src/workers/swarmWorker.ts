import { Worker, Job } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { SwarmService } from '../services/SwarmService.js';
import { getSupabaseAdmin } from '../config/supabase.js';

interface SwarmJobData {
  userId: string;
  prompt: string;
  projectId?: string;
  runId: string;
}

async function processSwarmJob(job: Job<SwarmJobData>) {
  const { userId, prompt, projectId, runId } = job.data;
  const supabase = getSupabaseAdmin();

  await supabase
    .from('swarm_job_queue')
    .update({ status: 'processing', bull_job_id: job.id })
    .eq('run_id', runId);

  try {
    await SwarmService.run(userId, prompt, projectId);
    await supabase
      .from('swarm_job_queue')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('run_id', runId);
  } catch (err) {
    await supabase
      .from('swarm_job_queue')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('run_id', runId);
    console.error('[swarmWorker] job failed (logged internally):', (err as Error).message);
  }
}

export function startSwarmWorker(): Worker | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('[swarmWorker] REDIS_URL not set — async queue disabled');
    return null;
  }

  const worker = new Worker<SwarmJobData>('swarm-tasks', processSwarmJob, {
    connection: { url, maxRetriesPerRequest: null },
    concurrency: Number(process.env.SWARM_WORKER_CONCURRENCY ?? 2),
  });

  worker.on('failed', (job, err) => {
    console.error('[swarmWorker] failed', job?.id, err.message);
  });

  console.log('[swarmWorker] started');
  return worker;
}
