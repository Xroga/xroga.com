// fetch with a short retry on a network failure (the connection dropped or timed out), never on an answer: a 404 or 403 is final.
export async function fetchRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      last = error;
      if (init.signal?.aborted) break;
      await new Promise(resolve => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
