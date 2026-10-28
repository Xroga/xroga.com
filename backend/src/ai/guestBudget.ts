import {createHash, randomUUID} from 'node:crypto';
import {getRedis} from '../config/redis.js';

export const GUEST_CHAT_PROMPT_LIMIT = 5;
export const GUEST_CHAT_WINDOW_MS = 24 * 60 * 60_000;
export const GUEST_CHAT_IP_WINDOW_MS = 15 * 60_000;
export const GUEST_CHAT_IP_LIMIT = 10;
export const GUEST_CHAT_TOKEN_BUDGET = 16_000;
export const GUEST_CHAT_CONCURRENCY_TTL_MS = 45_000;
export const GUEST_CHAT_CLAIM_TTL_MS = 24 * 60 * 60_000;

interface RateBucket {
  count: number;
  resetsAt: number;
}

export interface GuestLease {
  token: string;
  sessionId: string;
  redisKey?: string;
  expiresAt:number;
}
const issuedLeases=new WeakSet<GuestLease>();
const productionGuest=()=>process.env.NODE_ENV==='production'||Boolean(process.env.FLY_APP_NAME);
export function guestAccountingDenied():never{throw Object.assign(Error('Guest admission or accounting is unavailable.'),{code:'PROVIDER_RESERVATION_DENIED',status:503});}
function requireGuestRedis(){const redis=getRedis();if(!redis&&productionGuest())guestAccountingDenied();return redis;}
function issueGuestLease(lease:GuestLease):GuestLease{Object.freeze(lease);issuedLeases.add(lease);return lease;}

const sessionBuckets = new Map<string, RateBucket>();
const ipBuckets = new Map<string, RateBucket>();
const tokenBuckets = new Map<string, RateBucket>();
const activeSessions = new Map<string, { token: string; expiresAt: number }>();
const claimedSessions = new Map<string, number>();

function consumeBucket(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): { allowed: boolean; remaining: number; resetsAt: number } {
  const current = buckets.get(key);
  const bucket =
    !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + windowMs }
      : current;

  if (bucket.count >= limit) {
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, resetsAt: bucket.resetsAt };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    resetsAt: bucket.resetsAt,
  };
}

function consumeTokenBucket(
  guestSessionId: string,
  requestedTokens: number,
  now: number,
) {
  const current = tokenBuckets.get(guestSessionId);
  const bucket =
    !current || current.resetsAt <= now
      ? { count: 0, resetsAt: now + GUEST_CHAT_WINDOW_MS }
      : current;

  if (bucket.count + requestedTokens > GUEST_CHAT_TOKEN_BUDGET) {
    tokenBuckets.set(guestSessionId, bucket);
    return {
      allowed: false as const,
      remaining: Math.max(0, GUEST_CHAT_TOKEN_BUDGET - bucket.count),
      resetsAt: bucket.resetsAt,
    };
  }

  bucket.count += requestedTokens;
  tokenBuckets.set(guestSessionId, bucket);
  return {
    allowed: true as const,
    remaining: Math.max(0, GUEST_CHAT_TOKEN_BUDGET - bucket.count),
    resetsAt: bucket.resetsAt,
  };
}

function cleanExpired(now: number) {
  for (const [key, bucket] of sessionBuckets) {
    if (bucket.resetsAt <= now) sessionBuckets.delete(key);
  }
  for (const [key, bucket] of ipBuckets) {
    if (bucket.resetsAt <= now) ipBuckets.delete(key);
  }
  for (const [key, bucket] of tokenBuckets) {
    if (bucket.resetsAt <= now) tokenBuckets.delete(key);
  }
  for (const [key, lease] of activeSessions) {
    if (lease.expiresAt <= now) activeSessions.delete(key);
  }
  for (const [key, expiresAt] of claimedSessions) {
    if (expiresAt <= now) claimedSessions.delete(key);
  }
}

function stableAddressKey(address: string) {
  return createHash('sha256').update(address || 'unknown').digest('hex').slice(0, 32);
}

function fixedWindow(now: number, windowMs: number) {
  const start = Math.floor(now / windowMs) * windowMs;
  return { start, resetsAt: start + windowMs };
}

async function redisIncrement(
  key: string,
  amount: number,
  ttlMs: number,
): Promise<number> {
  const redis = getRedis();
  if (!redis) throw new Error('redis_not_configured');
  const result = await redis
    .multi()
    .incrby(key, amount)
    .pexpire(key, ttlMs * 2)
    .exec();
  const count=result?.[0]?.[1];
  if(!Array.isArray(result)||result.length!==2||result.some(row=>!row||row[0])
    ||typeof count!=='number'||!Number.isSafeInteger(count)||count<amount||result[1]?.[1]!==1)guestAccountingDenied();
  return count;
}

export async function consumeGuestAllowanceDistributed(
  guestSessionId: string,
  clientAddress: string,
  now = Date.now(),
) {
  const redis = requireGuestRedis();
  if (!redis) return consumeGuestAllowance(guestSessionId, clientAddress, now);

  try {
    const ipWindow = fixedWindow(now, GUEST_CHAT_IP_WINDOW_MS);
    const ipKey =
      `xroga:guest:ip:${stableAddressKey(clientAddress)}:${ipWindow.start}`;
    const ipCount = await redisIncrement(
      ipKey,
      1,
      GUEST_CHAT_IP_WINDOW_MS,
    );
    if (ipCount > GUEST_CHAT_IP_LIMIT) {
      return {
        allowed: false as const,
        reason: 'ip' as const,
        remaining: 0,
        resetsAt: ipWindow.resetsAt,
      };
    }

    const sessionWindow = fixedWindow(now, GUEST_CHAT_WINDOW_MS);
    const sessionKey =
      `xroga:guest:session:${guestSessionId}:${sessionWindow.start}`;
    const sessionCount = await redisIncrement(
      sessionKey,
      1,
      GUEST_CHAT_WINDOW_MS,
    );
    if (sessionCount > GUEST_CHAT_PROMPT_LIMIT) {
      return {
        allowed: false as const,
        reason: 'session' as const,
        remaining: 0,
        resetsAt: sessionWindow.resetsAt,
      };
    }

    return {
      allowed: true as const,
      remaining: Math.max(0, GUEST_CHAT_PROMPT_LIMIT - sessionCount),
      resetsAt: Math.max(sessionWindow.resetsAt, ipWindow.resetsAt),
    };
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/chat] Redis allowance unavailable');
    return consumeGuestAllowance(guestSessionId, clientAddress, now);
  }
}

export async function consumeGuestTokenBudgetDistributed(
  guestSessionId: string,
  requestedTokens: number,
  now = Date.now(),
) {
  const redis = requireGuestRedis();
  if (!redis) return consumeGuestTokenBudget(guestSessionId, requestedTokens, now);

  try {
    const window = fixedWindow(now, GUEST_CHAT_WINDOW_MS);
    const key =
      `xroga:guest:tokens:${guestSessionId}:${window.start}`;
    const used = await redisIncrement(key, requestedTokens, GUEST_CHAT_WINDOW_MS);
    return {
      allowed: used <= GUEST_CHAT_TOKEN_BUDGET,
      remaining: Math.max(0, GUEST_CHAT_TOKEN_BUDGET - used),
      resetsAt: window.resetsAt,
    } as const;
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/chat] Redis token-budget unavailable');
    return consumeGuestTokenBudget(guestSessionId, requestedTokens, now);
  }
}

export async function acquireGuestLease(
  guestSessionId: string,
  now = Date.now(),
): Promise<GuestLease | null> {
  cleanExpired(now);
  const redis = requireGuestRedis();
  if (redis) {
    try {
      const token = randomUUID();
      const redisKey = `xroga:guest:active:${guestSessionId}`;
      const result = await redis.set(
        redisKey,
        token,
        'PX',
        GUEST_CHAT_CONCURRENCY_TTL_MS,
        'NX',
      );
      if (result !== 'OK') return null;
      return issueGuestLease({ token, sessionId: guestSessionId, redisKey,expiresAt:now+GUEST_CHAT_CONCURRENCY_TTL_MS });
    } catch (error) {
      if(productionGuest())guestAccountingDenied();
      console.warn('[guest/chat] Redis concurrency unavailable');
    }
  }

  const existing = activeSessions.get(guestSessionId);
  if (existing && existing.expiresAt > now) return null;
  const token = randomUUID();
  activeSessions.set(guestSessionId, {
    token,
    expiresAt: now + GUEST_CHAT_CONCURRENCY_TTL_MS,
  });
  return issueGuestLease({ token, sessionId: guestSessionId,expiresAt:now+GUEST_CHAT_CONCURRENCY_TTL_MS });
}

export async function releaseGuestLease(lease: GuestLease) {
  issuedLeases.delete(lease);
  if (lease.redisKey) {
    const redis = getRedis();
    if (redis) {
      try {
        await redis.eval(
          "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
          1,
          lease.redisKey,
          lease.token,
        );
        return;
      } catch (error) {
        console.warn('[guest/chat] Redis lease release unavailable');
      }
    }
  }

  const current = activeSessions.get(lease.sessionId);
  if (current?.token === lease.token) activeSessions.delete(lease.sessionId);
}

export async function isGuestSessionClaimed(guestSessionId: string, now = Date.now()) {
  cleanExpired(now);
  if ((claimedSessions.get(guestSessionId) ?? 0) > now) return true;

  const redis = requireGuestRedis();
  if (!redis) return false;
  try {
    const receipt=await redis.exists(`xroga:guest:claimed:${guestSessionId}`);
    if(receipt!==0&&receipt!==1)guestAccountingDenied();
    return receipt===1;
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/chat] Redis claimed-session unavailable');
    return false;
  }
}

export async function markGuestSessionClaimed(
  guestSessionId: string,
  userId: string,
  now = Date.now(),
) {
  claimedSessions.set(guestSessionId, now + GUEST_CHAT_CLAIM_TTL_MS);

  const redis = requireGuestRedis();
  if (!redis) return;
  try {
    const receipt=await redis.set(
      `xroga:guest:claimed:${guestSessionId}`,
      userId,
      'PX',
      GUEST_CHAT_CLAIM_TTL_MS,
    );
    if(receipt!=='OK')guestAccountingDenied();
  } catch (error) {
    if(productionGuest())guestAccountingDenied();
    console.warn('[guest/claim] Redis claim persistence unavailable');
  }
}

export function consumeGuestAllowance(
  guestSessionId: string,
  clientAddress: string,
  now = Date.now(),
) {
  cleanExpired(now);

  const ip = consumeBucket(
    ipBuckets,
    stableAddressKey(clientAddress || 'unknown'),
    GUEST_CHAT_IP_LIMIT,
    GUEST_CHAT_IP_WINDOW_MS,
    now,
  );
  if (!ip.allowed) {
    return {
      allowed: false as const,
      reason: 'ip' as const,
      remaining: 0,
      resetsAt: ip.resetsAt,
    };
  }

  const session = consumeBucket(
    sessionBuckets,
    guestSessionId,
    GUEST_CHAT_PROMPT_LIMIT,
    GUEST_CHAT_WINDOW_MS,
    now,
  );
  if (!session.allowed) {
    return {
      allowed: false as const,
      reason: 'session' as const,
      remaining: 0,
      resetsAt: session.resetsAt,
    };
  }

  return {
    allowed: true as const,
    remaining: session.remaining,
    resetsAt: Math.max(session.resetsAt, ip.resetsAt),
  };
}

export function consumeGuestTokenBudget(
  guestSessionId: string,
  requestedTokens: number,
  now = Date.now(),
) {
  cleanExpired(now);
  return consumeTokenBucket(
    guestSessionId,
    Math.max(1, Math.floor(requestedTokens)),
    now,
  );
}

export function beginGuestConcurrencyForTest(
  guestSessionId: string,
  now = Date.now(),
) {
  cleanExpired(now);
  const existing = activeSessions.get(guestSessionId);
  if (existing && existing.expiresAt > now) return null;
  const token = randomUUID();
  activeSessions.set(guestSessionId, {
    token,
    expiresAt: now + GUEST_CHAT_CONCURRENCY_TTL_MS,
  });
  return token;
}

export function endGuestConcurrencyForTest(
  guestSessionId: string,
  token: string,
) {
  const current = activeSessions.get(guestSessionId);
  if (current?.token === token) activeSessions.delete(guestSessionId);
}

export function resetGuestChatRateLimitsForTest() {
  sessionBuckets.clear();
  ipBuckets.clear();
  tokenBuckets.clear();
  activeSessions.clear();
  claimedSessions.clear();
}

export async function requireCurrentGuestLease(lease:GuestLease){
  if(!issuedLeases.has(lease)||lease.expiresAt<=Date.now())guestAccountingDenied();
  const redis=requireGuestRedis();
  if(lease.redisKey){
    if(!redis)guestAccountingDenied();
    let current:unknown;try{current=await redis.get(lease.redisKey);}catch{guestAccountingDenied();}
    if(current!==lease.token)guestAccountingDenied();
  }else{const current=activeSessions.get(lease.sessionId);if(!current||current.token!==lease.token||current.expiresAt<=Date.now())guestAccountingDenied();}
  if(await isGuestSessionClaimed(lease.sessionId))guestAccountingDenied();
}
