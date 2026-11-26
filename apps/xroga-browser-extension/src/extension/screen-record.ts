// Recording a tab: Chrome's screencast of the tab (Page.startScreencast over the debugger the layer already holds) gives JPEG frames with times; the agent's own clicks come from the
// layer's action-point hook with their exact positions; at the end the frames are sent to the offscreen document, which makes an MP4 with mediabunny. See src/agent/record-tool.ts.
import type { RecordedClick } from '@src/agent/record-tool';
import { clicksToFractions } from '@src/agent/record-tool';
import { ensureOffscreen, offscreenBusy } from './downloads';

interface Frame {
  t: number;
  data: string;
}
interface Recording {
  tabId: number;
  startedAt: number;
  frames: Frame[];
  clicks: RecordedClick[];
  size: { width: number; height: number };
  bytes: number;
  maxSeconds: number;
  firstStamp?: number;
  full: boolean;
}

const active = new Map<number, Recording>();
const MAX_BYTES = 1024 * 1024 * 1024;
let listening = false;

function onEvent(source: chrome.debugger.Debuggee, method: string, params?: object): void {
  if (method !== 'Page.screencastFrame' || source.tabId === undefined) return;
  const r = active.get(source.tabId);
  const p = params as { data: string; sessionId: number; metadata?: { timestamp?: number; deviceWidth?: number; deviceHeight?: number } };
  // every frame is acknowledged, or the browser stops sending
  void chrome.debugger.sendCommand({ tabId: source.tabId }, 'Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => undefined);
  if (!r || r.full) return;
  const stamp = p.metadata?.timestamp ?? Date.now() / 1000;
  r.firstStamp ??= stamp;
  const t = Math.max(0, stamp - r.firstStamp);
  if (p.metadata?.deviceWidth && p.metadata.deviceHeight) r.size = { width: p.metadata.deviceWidth, height: p.metadata.deviceHeight };
  if (t > r.maxSeconds || r.bytes + p.data.length > MAX_BYTES) {
    r.full = true;
    return;
  }
  r.frames.push({ t, data: p.data });
  r.bytes += p.data.length;
}

/** The layer calls this for each action it takes in a tab (a click, typing, a scroll): clicks are kept while a recording runs. */
export function noteActionPoint(tabId: number, point: { x: number; y: number }, kind: string): void {
  const r = active.get(tabId);
  if (r && kind === 'click') r.clicks.push({ t: (Date.now() - r.startedAt) / 1000, x: point.x, y: point.y });
}

export const isRecording = (tabId: number): boolean => active.has(tabId);

export async function startRecording(tabId: number, maxSeconds: number): Promise<void> {
  if (active.has(tabId)) throw new Error('this tab is already being recorded');
  const targets = await chrome.debugger.getTargets();
  if (!targets.some(t => t.tabId === tabId && t.attached)) throw new Error('the tab is not open for the agent yet: work in it first (open the page), then start recording');
  if (!listening) {
    chrome.debugger.onEvent.addListener(onEvent);
    listening = true;
  }
  const r: Recording = { tabId, startedAt: Date.now(), frames: [], clicks: [], size: { width: 0, height: 0 }, bytes: 0, maxSeconds, full: false };
  active.set(tabId, r);
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
  } catch (error) {
    active.delete(tabId);
    throw error;
  }
}

export interface Recorded {
  url: string;
  bytes: number;
  seconds: number;
  frames: number;
  width: number;
  height: number;
  container: 'mp4' | 'webm';
  clicks: RecordedClick[];
  notes: string[];
}

/** Ends the recording, makes the video in the offscreen document and keeps it as recording:last there; the blob URL is for saving. */
export async function stopRecording(tabId: number): Promise<Recorded> {
  const r = active.get(tabId);
  if (!r) throw new Error('no recording is running in this tab');
  active.delete(tabId);
  await chrome.debugger.sendCommand({ tabId }, 'Page.stopScreencast').catch(() => undefined);
  if (r.frames.length < 2) throw new Error('the page showed nothing new to record: the tab was still. Do something in it while recording.');
  const notes: string[] = [];
  if (r.full) notes.push(`the recording stopped at its limit (${r.maxSeconds} s or ${Math.round(MAX_BYTES / 1048576)} MB)`);
  offscreenBusy(1);
  try {
    await ensureOffscreen();
    const id = crypto.randomUUID();
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'record-begin', id });
    // frames go over in parts of about 20 MB, so no message is too large
    let batch: Frame[] = [];
    let size = 0;
    const send = async () => {
      if (!batch.length) return;
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'record-frames', id, frames: batch });
      batch = [];
      size = 0;
    };
    for (const f of r.frames) {
      batch.push(f);
      size += f.data.length;
      if (size > 20 * 1024 * 1024) await send();
    }
    await send();
    const answer = (await chrome.runtime.sendMessage({ target: 'offscreen', type: 'record-finish', id })) as ({ ok: true; url: string; bytes: number; seconds: number; frames: number; width: number; height: number; container: 'mp4' | 'webm'; notes: string[] }) | { ok: false; error: string } | undefined;
    if (!answer) throw new Error('the video maker did not answer');
    if (!answer.ok) throw new Error(answer.error);
    return { url: answer.url, bytes: answer.bytes, seconds: answer.seconds, frames: answer.frames, width: answer.width, height: answer.height, container: answer.container, clicks: clicksToFractions(r.clicks, r.size), notes: [...notes, ...answer.notes] };
  } finally {
    offscreenBusy(-1);
  }
}

export function recordingStatus(tabId: number): { running: boolean; seconds: number; frames: number } {
  const r = active.get(tabId);
  return r ? { running: true, seconds: (Date.now() - r.startedAt) / 1000, frames: r.frames.length } : { running: false, seconds: 0, frames: 0 };
}
