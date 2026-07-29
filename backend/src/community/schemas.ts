import { z } from 'zod';
import { COMMUNITY_CATEGORIES, COMMUNITY_STATUSES, OFFICIAL_IDENTITIES } from './types.js';

const plainText = (min: number, max: number) =>
  z.string().trim().min(min).max(max).transform((value) =>
    value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  );

export const createCommunityPostSchema = z.object({
  category: z.enum(COMMUNITY_CATEGORIES),
  title: plainText(5, 150),
  body: plainText(10, 5000),
}).strict();

export const updateCommunityPostSchema = z.object({
  category: z.enum(COMMUNITY_CATEGORIES).optional(),
  title: plainText(5, 150).optional(),
  body: plainText(10, 5000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No post fields supplied');

export const createCommunityCommentSchema = z.object({
  body: plainText(1, 5000),
  officialIdentity: z.enum(OFFICIAL_IDENTITIES).nullable().optional(),
}).strict();

export const updateCommunityCommentSchema = z.object({
  body: plainText(1, 5000).optional(),
  isAcceptedAnswer: z.boolean().optional(),
  isHidden: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No comment fields supplied');

export const moderateCommunityPostSchema = z.object({
  status: z.enum(COMMUNITY_STATUSES).optional(),
  isPinned: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  isLocked: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'No moderation fields supplied');

export const communityNoteSchema = z.object({
  note: plainText(1, 5000),
}).strict();

export const communityListSchema = z.object({
  filter: z.enum(['trending', 'new', 'unanswered', 'feedback', 'feature_request', 'bug', 'question', 'released', 'solved']).default('new'),
  search: z.string().trim().max(120).default(''),
  status: z.enum(COMMUNITY_STATUSES).optional(),
  category: z.enum(COMMUNITY_CATEGORIES).optional(),
  hidden: z.enum(['include', 'only', 'exclude']).default('exclude'),
  official: z.enum(['missing', 'any']).default('any'),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, 'The start date must not be after the end date.');

export type CreateCommunityPostInput = z.infer<typeof createCommunityPostSchema>;
export type UpdateCommunityPostInput = z.infer<typeof updateCommunityPostSchema>;
export type CreateCommunityCommentInput = z.infer<typeof createCommunityCommentSchema>;
export type UpdateCommunityCommentInput = z.infer<typeof updateCommunityCommentSchema>;
export type ModerateCommunityPostInput = z.infer<typeof moderateCommunityPostSchema>;
export type CommunityListInput = z.infer<typeof communityListSchema>;
