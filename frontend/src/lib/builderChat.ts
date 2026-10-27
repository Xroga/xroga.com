'use client';

import { BUILDER_ENABLED, builderApi } from '@/lib/builderApi';
import { useBuilderProjectStore } from '@/store/useBuilderProjectStore';

/**
 * Decides which AI Product Builder project, if any, a chat build request belongs to.
 *
 * - A new web product request creates a durable project (idempotent on the message key, so a retry
 *   never creates a second one) and builds into it.
 * - A follow-up in the same workspace continues the SAME project instead of creating another.
 * - Requests that target a GitHub repository keep the existing repository path untouched.
 * - Any failure (not signed in, unsupported product, builder not enabled) falls back to the
 *   existing path; nothing is claimed that did not happen.
 */
export async function resolveBuilderProject(input: {
  prompt: string;
  isNewProduct: boolean;
  hasRepositoryTarget: boolean;
  messageKey: string;
  conversationId?: string | null;
}): Promise<string | undefined> {
  if (!BUILDER_ENABLED || input.hasRepositoryTarget) return undefined;
  const store = useBuilderProjectStore.getState();
  if (!input.isNewProduct) return store.projectId ?? undefined;
  try {
    const key = `chat:${input.messageKey}`.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
    const { project } = await builderApi.create({ prompt: input.prompt, requestKey: key, conversationId: input.conversationId ?? null });
    store.setProjectId(project.id);
    return project.id;
  } catch {
    return undefined;
  }
}
