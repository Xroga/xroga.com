import type { IncomingMessage, Server } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { verifyAccessToken } from '../../middleware/auth.js';
import { runVoicePipeline } from './pipeline.js';
import { synthesizeWelcome } from './welcomeVoice.js';
import { toVoiceUserError } from './voiceErrors.js';
import type { VoiceGender } from './edgeTts.js';

interface VoiceClientState {
  userId: string;
  chunks: Buffer[];
  mimeType: string;
  processing: boolean;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function parseTokenFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('token');
  } catch {
    return null;
  }
}

async function handleGreeting(ws: WebSocket, displayName?: string, voiceGender?: VoiceGender) {
  try {
    sendJson(ws, { type: 'status', stage: 'speaking' });
    const { text, audio } = await synthesizeWelcome(displayName, voiceGender ?? 'female');
    sendJson(ws, { type: 'greeting', text });
    if (ws.readyState === ws.OPEN) {
      ws.send(audio, { binary: true });
    }
    sendJson(ws, { type: 'done' });
  } catch (e) {
    sendJson(ws, { type: 'error', message: toVoiceUserError(e) });
  }
}

async function handleEndOfSpeech(
  ws: WebSocket,
  state: VoiceClientState,
  clientTranscript?: string,
  voiceGender?: VoiceGender
) {
  if (state.processing) return;
  state.processing = true;

  const audio = Buffer.concat(state.chunks);
  state.chunks = [];

  if (audio.length < 800 && !clientTranscript?.trim()) {
    sendJson(ws, { type: 'error', message: 'Recording too short — hold Talk and speak again.' });
    state.processing = false;
    return;
  }

  try {
    const result = await runVoicePipeline(
      audio,
      state.mimeType,
      (stage) => {
        sendJson(ws, { type: 'status', stage });
      },
      (text) => {
        sendJson(ws, { type: 'user_text', text });
      },
      clientTranscript,
      voiceGender ?? 'female'
    );

    sendJson(ws, {
      type: 'transcript',
      text: result.transcript,
      reply: result.reply,
      cached: result.cached,
      searchedWeb: result.searchedWeb,
    });

    if (ws.readyState === ws.OPEN) {
      ws.send(result.audio, { binary: true });
    }

    sendJson(ws, { type: 'done' });
  } catch (e) {
    sendJson(ws, { type: 'error', message: toVoiceUserError(e) });
  } finally {
    state.processing = false;
  }
}

export function attachVoiceWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const pathname = req.url?.split('?')[0];
    if (pathname !== '/api/voice/ws') {
      return;
    }

    void (async () => {
      const token = parseTokenFromUrl(req.url);
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        const { userId } = await verifyAccessToken(token);
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, userId);
        });
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    })();
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, userId: string) => {
    const state: VoiceClientState = {
      userId,
      chunks: [],
      mimeType: 'audio/webm',
      processing: false,
    };

    sendJson(ws, { type: 'ready' });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!state.processing) {
          state.chunks.push(Buffer.from(data as ArrayBuffer));
        }
        return;
      }

      try {
        const msg = JSON.parse(String(data)) as {
          type?: string;
          mimeType?: string;
          displayName?: string;
          clientTranscript?: string;
          voiceGender?: VoiceGender;
        };

        if (msg.type === 'greeting') {
          void handleGreeting(ws, msg.displayName, msg.voiceGender);
          return;
        }

        if (state.processing) return;

        if (msg.type === 'start') {
          state.chunks = [];
          if (msg.mimeType) state.mimeType = msg.mimeType;
          sendJson(ws, { type: 'recording' });
          return;
        }

        if (msg.type === 'end') {
          void handleEndOfSpeech(ws, state, msg.clientTranscript, msg.voiceGender);
        }
      } catch {
        sendJson(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('error', (err) => {
      console.warn('[voice/ws] client error:', err.message);
    });
  });

  console.log('[voice] WebSocket ready at /api/voice/ws');
}
