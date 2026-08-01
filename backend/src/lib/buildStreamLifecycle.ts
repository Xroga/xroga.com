type StreamEventSource = {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
};

/**
 * Detach the HTTP transport without cancelling the durable build behind it.
 * Refreshing, navigating away, or a proxy closing SSE must never become a
 * build cancellation. Explicit cancellation is handled by the run endpoint.
 */
export function bindBuildStreamDisconnect(
  request: StreamEventSource,
  response: StreamEventSource,
  disconnect: () => void,
): () => void {
  let disconnected = false;
  const handleDisconnect = () => {
    if (disconnected) return;
    disconnected = true;
    disconnect();
  };

  request.once('aborted', handleDisconnect);
  response.once('close', handleDisconnect);

  return () => {
    request.removeListener('aborted', handleDisconnect);
    response.removeListener('close', handleDisconnect);
  };
}
