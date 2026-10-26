'use client';

import { create } from 'zustand';

const KEY = 'xroga.builder.activeProject';

function read(): string | null {
  try {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The builder project the workspace is currently building, and the chat it belongs to. A per-viewer convenience: the project and its
 * chat association are durable on the server, so a different browser or a reopened chat finds the same project.
 */
interface BuilderProjectStore {
  projectId: string | null;
  /** The chat conversation `projectId` was resolved for; null until a chat has been looked up. */
  conversationId: string | null;
  setProjectId: (id: string | null) => void;
  /** Points the workspace at a chat conversation and the project it is building (null when it has none). */
  bindConversation: (conversationId: string, projectId: string | null) => void;
}

function write(id: string | null) {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable; the project is restored from the server instead.
  }
}

export const useBuilderProjectStore = create<BuilderProjectStore>((set) => ({
  projectId: read(),
  conversationId: null,
  setProjectId: (id) => {
    write(id);
    set({ projectId: id });
  },
  bindConversation: (conversationId, projectId) => {
    write(projectId);
    set({ conversationId, projectId });
  },
}));
