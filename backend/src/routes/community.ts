import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z, ZodError } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { optionalAuthMiddleware } from '../middleware/auth.js';
import { communityMutationRateLimit } from '../community/rateLimit.js';
import {
  communityListSchema,
  communityNoteSchema,
  createCommunityCommentSchema,
  createCommunityPostSchema,
  moderateCommunityPostSchema,
  updateCommunityCommentSchema,
  updateCommunityPostSchema,
} from '../community/schemas.js';
import { CommunityService, CommunityServiceError } from '../community/service.js';

const router = Router();
const service = new CommunityService();
const idSchema = z.string().uuid();
const mutationLimit = communityMutationRateLimit({ limit: 12, windowMs: 60_000 });
const voteLimit = communityMutationRateLimit({ limit: 60, windowMs: 60_000 });

type AsyncHandler = (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler): RequestHandler => (req, res, next) => {
  void handler(req as AuthRequest, res, next).catch(next);
};

function requireUser(req: AuthRequest): string {
  if (!req.userId) throw new CommunityServiceError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return req.userId;
}

router.use(optionalAuthMiddleware);

router.get('/me', asyncRoute(async (req, res) => {
  res.json({ authenticated: Boolean(req.userId), userId: req.userId ?? null, role: await service.role(req.userId) });
}));

router.get('/posts', asyncRoute(async (req, res) => {
  res.json(await service.listPosts(communityListSchema.parse(req.query), req.userId));
}));

router.get('/posts/:postId', asyncRoute(async (req, res) => {
  res.json(await service.getPost(idSchema.parse(req.params.postId), req.userId));
}));

router.post('/posts', mutationLimit, asyncRoute(async (req, res) => {
  const post = await service.createPost(requireUser(req), createCommunityPostSchema.parse(req.body));
  res.status(201).json({ post });
}));

router.patch('/posts/:postId', mutationLimit, asyncRoute(async (req, res) => {
  const post = await service.updatePost(requireUser(req), idSchema.parse(req.params.postId), updateCommunityPostSchema.parse(req.body));
  res.json({ post });
}));

router.delete('/posts/:postId', mutationLimit, asyncRoute(async (req, res) => {
  await service.deletePost(requireUser(req), idSchema.parse(req.params.postId));
  res.status(204).end();
}));

router.post('/posts/:postId/comments', mutationLimit, asyncRoute(async (req, res) => {
  const comment = await service.createComment(requireUser(req), idSchema.parse(req.params.postId), createCommunityCommentSchema.parse(req.body));
  res.status(201).json({ comment });
}));

router.patch('/comments/:commentId', mutationLimit, asyncRoute(async (req, res) => {
  await service.updateComment(requireUser(req), idSchema.parse(req.params.commentId), updateCommunityCommentSchema.parse(req.body));
  res.status(204).end();
}));

router.delete('/comments/:commentId', mutationLimit, asyncRoute(async (req, res) => {
  await service.deleteComment(requireUser(req), idSchema.parse(req.params.commentId));
  res.status(204).end();
}));

router.put('/posts/:postId/vote', voteLimit, asyncRoute(async (req, res) => {
  res.json(await service.setVote(requireUser(req), idSchema.parse(req.params.postId), true));
}));

router.delete('/posts/:postId/vote', voteLimit, asyncRoute(async (req, res) => {
  res.json(await service.setVote(requireUser(req), idSchema.parse(req.params.postId), false));
}));

router.get('/admin/summary', asyncRoute(async (req, res) => {
  res.json(await service.summary(requireUser(req)));
}));

router.patch('/admin/posts/:postId', mutationLimit, asyncRoute(async (req, res) => {
  const post = await service.moderatePost(requireUser(req), idSchema.parse(req.params.postId), moderateCommunityPostSchema.parse(req.body));
  res.json({ post });
}));

router.get('/admin/posts/:postId/notes', asyncRoute(async (req, res) => {
  res.json({ notes: await service.notes(requireUser(req), idSchema.parse(req.params.postId)) });
}));

router.post('/admin/posts/:postId/notes', mutationLimit, asyncRoute(async (req, res) => {
  const { note } = communityNoteSchema.parse(req.body);
  res.status(201).json({ note: await service.addNote(requireUser(req), idSchema.parse(req.params.postId), note) });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Check the highlighted fields and try again.',
      code: 'VALIDATION_ERROR',
      details: err.flatten(),
    });
    return;
  }
  if (err instanceof CommunityServiceError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('[community] unexpected failure', err instanceof Error ? err.message : 'unknown');
  res.status(500).json({ error: 'The community request could not be completed.', code: 'COMMUNITY_ERROR' });
});

export default router;
