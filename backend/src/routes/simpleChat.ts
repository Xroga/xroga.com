import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';

const router = Router();

const chatCors = cors({
  origin: [
    'https://xroga.com',
    'https://www.xroga.com',
    'http://localhost:3000',
    'https://xroga-api.fly.dev',
  ],
  credentials: true,
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

    const supabase = getSupabase();

    const { error: userMsgError } = await supabase.from('messages').insert({
      user_id: userId,
      content: message.trim(),
      role: 'user',
    });

    if (userMsgError) {
      console.error('[chat] insert user message:', userMsgError.message);
      res.status(500).json({ success: false, error: userMsgError.message });
      return;
    }

    const aiReply = `Echo: ${message.trim()}`;

    const { error: aiMsgError } = await supabase.from('messages').insert({
      user_id: userId,
      content: aiReply,
      role: 'assistant',
    });

    if (aiMsgError) {
      console.error('[chat] insert assistant message:', aiMsgError.message);
      res.status(500).json({ success: false, error: aiMsgError.message });
      return;
    }

    res.json({ success: true, reply: aiReply });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

export default router;
