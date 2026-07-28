type StreamEventSource = {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
};

export interface BuildStreamState {
  responseEnded: boolean;
  codeReady: boolean;
}

/**
 * Abort model work only when the request is actually interrupted or the
 * response connection disappears. A normal IncomingMessage `close` event
 * merely means the request body has been consumed and must not cancel SSE.
 */
export function bindBuildStreamAbort(
  request: StreamEventSource,
  response: StreamEventSource,
  getState: () => BuildStreamState,
  abort: () => void,
): () => void {
  const handleDisconnect = () => {
    const state = getState();
    if (!state.responseEnded && !state.codeReady) abort();
  };

  request.once('aborted', handleDisconnect);
  response.once('close', handleDisconnect);

  return () => {
    request.removeListener('aborted', handleDisconnect);
    response.removeListener('close', handleDisconnect);
  };
}
