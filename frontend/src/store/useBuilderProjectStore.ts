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

/** The builder project the workspace is currently building. A per-viewer convenience: the project itself is durable on the server. */
interface BuilderProjectStore {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}

export const useBuilderProjectStore = create<BuilderProjectStore>((set) => ({
  projectId: read(),
  setProjectId: (id) => {
    try {
      if (id) window.localStorage.setItem(KEY, id);
      else window.localStorage.removeItem(KEY);
    } catch {
      // Storage can be unavailable; the project is restored from the server list instead.
    }
    set({ projectId: id });
  },
}));
