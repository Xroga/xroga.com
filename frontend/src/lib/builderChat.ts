'use client';

import toast from 'react-hot-toast';

import { BUILDER_ENABLED, BuilderApiError, builderApi } from '@/lib/builderApi';
import { builderPhase2Api } from '@/lib/builderApiPhase2';
import { useBuilderProjectStore } from '@/store/useBuilderProjectStore';

/**
 * Decides which AI Product Builder project, if any, a chat build request belongs to.
 *
 * - A new web product request creates a durable project (idempotent on the message key, so a retry
 *   never creates a second one) and builds into it.
 * - Inside an existing project the server classifies the message: a change request continues the
 *   SAME project, and only an explicit request for something separate creates another.
 * - Requests that target a GitHub repository keep the existing repository path untouched.
 * - Any failure (not signed in, unsupported product, builder not enabled) falls back safely;
 *   nothing is claimed that did not happen.
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
  let createNew = input.isNewProduct;
  if (store.projectId && !input.isNewProduct) {
    try {
      const decision = await builderPhase2Api.intent({ prompt: input.prompt, projectId: store.projectId });
      if (decision.intent === 'followup' && decision.projectId) return decision.projectId;
      if (decision.intent === 'other') return undefined;
      createNew = decision.intent === 'new_product';
    } catch (error) {
      // The stored project is not this user's, or no longer exists (a shared browser, a deleted project): forget it rather than
      // sending an id the server will refuse for the whole message.
      if (error instanceof BuilderApiError && error.status === 404) {
        store.setProjectId(null);
        createNew = input.isNewProduct;
        if (!createNew) return undefined;
      } else {
        // If the decision cannot be made, keep working on the same project rather than creating a duplicate.
        return store.projectId ?? undefined;
      }
    }
  }
  if (!createNew) return store.projectId ?? undefined;
  try {
    const key = `chat:${input.messageKey}`.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
    const { project } = await builderApi.create({ prompt: input.prompt, requestKey: key, conversationId: input.conversationId ?? null });
    store.setProjectId(project.id);
    return project.id;
  } catch (error) {
    // Not silent: the user is told when the project builder refused the request, then the existing path continues.
    if (error instanceof BuilderApiError && (error.status === 422 || error.status === 400) && error.message) {
      toast(error.message, { duration: 6000 });
    }
    return undefined;
  }
}
