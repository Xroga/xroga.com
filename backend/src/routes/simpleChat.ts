import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import { runSwarm, type ChatHistoryMessage } from '../services/aiSwarm.js';
import { initSSE, sendSSE, endSSE } from '../lib/sse.js';

const router = Router();

const chatCors = cors({
  origin: [
    'https://xroga.com',
    'https://www.xroga.com',
    'http://localhost:3000',
    'https://xroga-api.fly.dev',
    /\.vercel\.app$/,
  ],
  credentials: true,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
});

router.use(chatCors);
router.options('/', chatCors);

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /chat
 * Body: { message: string, userId: string }
 * Streams SSE chunks with the AI swarm response.
 */
router.post('/', async (req, res) => {
  try {
    const { message, userId } = req.body as { message?: string; userId?: string };

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ success: false, error: 'message is required' });
      return;
    }

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({
        success: false,
        error: 'OPENAI_API_KEY is not configured on the server',
      });
      return;
    }

    const supabase = getSupabase();
    const trimmedMessage = message.trim();

    const { data: historyRows, error: historyError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (historyError) {
      console.error('[chat] fetch history:', historyError.message);
      res.status(500).json({ success: false, error: historyError.message });
      return;
    }

    const chatHistory: ChatHistoryMessage[] = (historyRows ?? [])
      .reverse()
      .filter((row): row is ChatHistoryMessage => row.role === 'user' || row.role === 'assistant');

    const { error: userMsgError } = await supabase.from('messages').insert({
      user_id: userId,
      content: trimmedMessage,
      role: 'user',
    });

    if (userMsgError) {
      console.error('[chat] insert user message:', userMsgError.message);
      res.status(500).json({ success: false, error: userMsgError.message });
      return;
    }

    initSSE(res);

    const stream = await runSwarm(userId, trimmedMessage, chatHistory);
    let fullReply = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullReply += delta;
        sendSSE(res, { data: { delta } });
      }
    }

    if (fullReply.trim()) {
      const { error: aiMsgError } = await supabase.from('messages').insert({
        user_id: userId,
        content: fullReply.trim(),
        role: 'assistant',
      });

      if (aiMsgError) {
        console.error('[chat] insert assistant message:', aiMsgError.message);
        sendSSE(res, { event: 'error', data: { error: aiMsgError.message } });
        res.end();
        return;
      }
    }

    endSSE(res);
  } catch (err) {
    console.error('[chat]', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      });
      return;
    }

    sendSSE(res, {
      event: 'error',
      data: { error: err instanceof Error ? err.message : 'Internal server error' },
    });
    res.end();
  }
});

export default router;
