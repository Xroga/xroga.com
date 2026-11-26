interface ConnectionState {
  paired?: boolean;
  connecting?: boolean;
  failure?: string;
}

/** A worker may be restarting when the first panel message is sent. Retry
 * delivery once, only after the worker answers a normal status read. */
export function automaticWorkspaceConnect(send: () => Promise<unknown>) {
  let inFlight = false;
  let deliveryFailed = false;
  let retried = false;
  let closed = false;

  async function start() {
    if (closed || inFlight) return;
    inFlight = true;
    deliveryFailed = false;
    try {
      await send();
    } catch {
      deliveryFailed = !retried;
    } finally {
      inFlight = false;
    }
  }

  async function observe(status: ConnectionState | undefined) {
    if (closed || !status || !deliveryFailed || inFlight) return;
    if (status.paired || status.connecting || status.failure) {
      deliveryFailed = false;
      return;
    }
    retried = true;
    await start();
  }

  return { start, observe, close: () => { closed = true; } };
}
