import { Queue } from 'bullmq';
import { getRedis } from './redis.js';

let notificationQueue: Queue | null = null;
let tokenDistributionQueue: Queue | null = null;
let emailQueue: Queue | null = null;

function queueConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return { url, maxRetriesPerRequest: null as null };
}

export function getNotificationQueue(): Queue | null {
  const conn = queueConnection();
  if (!conn) return null;
  if (!notificationQueue) {
    notificationQueue = new Queue('notifications', { connection: conn });
  }
  return notificationQueue;
}

export function getTokenDistributionQueue(): Queue | null {
  const conn = queueConnection();
  if (!conn) return null;
  if (!tokenDistributionQueue) {
    tokenDistributionQueue = new Queue('token-distribution', { connection: conn });
  }
  return tokenDistributionQueue;
}

export function getEmailQueue(): Queue | null {
  const conn = queueConnection();
  if (!conn) return null;
  if (!emailQueue) {
    emailQueue = new Queue('email-jobs', { connection: conn });
  }
  return emailQueue;
}

export async function enqueueNotification(payload: {
  userId: string;
  title: string;
  message: string;
  type?: string;
}): Promise<boolean> {
  const q = getNotificationQueue();
  if (!q) return false;
  try {
    await q.add('send', payload, { removeOnComplete: 100, attempts: 3 });
    return true;
  } catch {
    return false;
  }
}

export async function enqueueTokenDistribution(userId: string): Promise<boolean> {
  const q = getTokenDistributionQueue();
  if (!q) return false;
  try {
    await q.add('auto-distribute', { userId }, { removeOnComplete: 50, attempts: 2 });
    return true;
  } catch {
    return false;
  }
}

export function isQueueSystemReady(): boolean {
  return Boolean(getRedis());
}
