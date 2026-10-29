/** Preserve typed formatting and legitimate repeated words. Each session publishes once. */
export function appendVoiceTranscript(current: string, transcript: string): string {
  const text = transcript.trim();
  return text ? current + (current && !/\s$/.test(current) ? ' ' : '') + text : current;
}

export function captureVoiceRecording(stream: MediaStream, signal: AbortSignal,
  Recorder: typeof MediaRecorder = MediaRecorder, limitMs = 120000) {
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(mime => Recorder.isTypeSupported(mime));
  const recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
  let resolveReady!: (started: boolean) => void;
  const ready = new Promise<boolean>(resolve => { resolveReady = resolve; });
  let finished = false, stopping = false, bytes = 0;
  const chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout>;
  let stopTimer: ReturnType<typeof setTimeout>;
  let rejectAudio: (error: Error) => void;
  const tracks = stream.getTracks();
  const cleanup = () => {
    clearTimeout(timer); clearTimeout(stopTimer);
    signal.removeEventListener('abort', abort);
    for (const track of tracks) { track.removeEventListener('ended', interrupted); track.stop(); }
    recorder.ondataavailable = null; recorder.onerror = null; recorder.onstop = null;
    recorder.onstart = null;
    resolveReady(false);
    chunks.length = 0;
  };
  const fail = (name: string) => {
    if (finished) return;
    finished = true;
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
    cleanup(); rejectAudio(Object.assign(new Error(name), { name }));
  };
  const abort = () => fail('AbortError');
  const interrupted = () => fail('RecordingInterruptedError');
  const audio = new Promise<Blob>((resolve, reject) => {
    rejectAudio = reject;
    recorder.onstart = () => resolveReady(true);
    recorder.ondataavailable = event => {
      if (finished) return;
      bytes += event.data.size;
      if (bytes > 8 * 1024 * 1024) { fail('RecordingLimitError'); return; }
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = interrupted;
    recorder.onstop = () => {
      if (finished) return;
      if (!stopping) { fail('RecordingInterruptedError'); return; }
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'application/octet-stream' });
      finished = true; cleanup();
      if (blob.size < 512) reject(Object.assign(new Error('No usable audio'), { name: 'RecordingInterruptedError' }));
      else resolve(blob);
    };
    signal.addEventListener('abort', abort, { once: true });
    for (const track of tracks) track.addEventListener('ended', interrupted, { once: true });
    if (signal.aborted) { abort(); return; }
    try { recorder.start(250); timer = setTimeout(() => fail('RecordingLimitError'), limitMs); }
    catch { interrupted(); }
  });
  const stop = () => {
    if (finished || stopping) return;
    stopping = true;
    clearTimeout(timer);
    stopTimer = setTimeout(interrupted, 5000);
    try { recorder.stop(); } catch { interrupted(); }
  };
  return { audio, stop, ready };
}
