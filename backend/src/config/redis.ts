import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

let redis: Redis | null = null;
let swarmQueue: Queue | null = null;

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!redis) {
    redis = new Redis(url, { maxRetriesPerRequest: null });
  }
  return redis;
}

export function getSwarmQueue(): Queue | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!swarmQueue) {
    swarmQueue = new Queue('swarm-tasks', {
      connection: { url, maxRetriesPerRequest: null },
    });
  }
  return swarmQueue;
}
