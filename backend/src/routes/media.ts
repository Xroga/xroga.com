import { Router } from 'express';
import { z } from 'zod';
import { buildR2Key, uploadToR2 } from '../lib/r2.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(3).max(100),
  dataBase64: z.string().min(20).max(12_000_000),
});

router.post('/upload', async (req: AuthRequest, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid upload payload' });
    return;
  }

  const { filename, contentType, dataBase64 } = parsed.data;
  const buffer = Buffer.from(dataBase64, 'base64');

  if (buffer.length > 8 * 1024 * 1024) {
    res.status(400).json({ error: 'File too large (max 8MB)' });
    return;
  }

  if (!contentType.startsWith('image/')) {
    res.status(400).json({ error: 'Only image uploads are supported' });
    return;
  }

  try {
    const key = buildR2Key(req.userId!, filename);
    const uploaded = await uploadToR2(key, buffer, contentType);
    res.json({ url: uploaded.publicUrl, key: uploaded.key });
  } catch {
    const dataUrl = `data:${contentType};base64,${dataBase64}`;
    res.json({
      url: dataUrl,
      fallback: true,
      message: 'Stored inline — R2 not configured on server',
    });
  }
});

export default router;
