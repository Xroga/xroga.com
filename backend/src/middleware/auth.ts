import type { Request, Response, NextFunction } from 'express';
import { createSupabaseClient } from '../config/supabase.js';

export interface AuthRequest extends Request {
  userId?: string;
  accessToken?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const supabase = createSupabaseClient(token);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.userId = user.id;
    req.accessToken = token;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}
