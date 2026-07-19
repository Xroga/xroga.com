'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { loadPreviewBlob, savePreviewBlob } from '@/lib/workspacePreviewStorage';

export type ProjectWorkspaceStatus =
  | 'idle'
  | 'updating'
  | 'pushed'
  | 'live'
  | 'degraded';

export interface FileTrailItem {
  path: string;
  before: string;
  after: string;
  added: number;
  removed: number;
}

export interface ProjectWorkspaceState {
  repo: string | null;
  branch: string;
  projectName: string | null;
  html: string;
  css: string;
  js: string;
  deployUrl: string | null;
  githubRepoUrl: string | null;
  commitSha: string | null;
  status: ProjectWorkspaceStatus;
  previewOpen: boolean;
  lastUpdateAt: number | null;
  lastChanges: string[];
  lastFileTrail: FileTrailItem[];
  previousFiles: Array<{ path: string; content: string }> | null;
  applyBuild: (payload: {
    repo?: string | null;
    branch?: string;
    projectName?: string | null;
    html: string;
    css: string;
    js: string;
    deployUrl?: string | null;
    githubRepoUrl?: string | null;
    commitSha?: string | null;
    status?: ProjectWorkspaceStatus;
    changesSummary?: string[];
    fileTrail?: FileTrailItem[];
    previousFiles?: Array<{ path: string; content: string }> | null;
    openPreview?: boolean;
  }) => void;
  setStatus: (status: ProjectWorkspaceStatus) => void;
  setPreviewOpen: (open: boolean) => void;
  clearRollbackBuffer: () => void;
  hydratePreviewFromDisk: () => Promise<void>;
  reset: () => void;
}

const empty = {
  repo: null as string | null,
  branch: 'main',
  projectName: null as string | null,
  html: '',
  css: '',
  js: '',
  deployUrl: null as string | null,
  githubRepoUrl: null as string | null,
  commitSha: null as string | null,
  status: 'idle' as ProjectWorkspaceStatus,
  previewOpen: false,
  lastUpdateAt: null as number | null,
  lastChanges: [] as string[],
  lastFileTrail: [] as FileTrailItem[],
  previousFiles: null as Array<{ path: string; content: string }> | null,
};

function persistPreview(s: {
  html: string;
  css: string;
  js: string;
  repo: string | null;
  projectName: string | null;
}) {
  if (!s.html?.trim()) return;
  void savePreviewBlob({
    html: s.html.slice(0, 400_000),
    css: (s.css || '').slice(0, 200_000),
    js: (s.js || '').slice(0, 200_000),
    repo: s.repo,
    projectName: s.projectName,
    updatedAt: Date.now(),
  });
}

/** One live project workspace per selected repo — Plan A single preview surface. */
export const useProjectWorkspaceStore = create<ProjectWorkspaceState>()(
  persist(
    (set, get) => ({
      ...empty,
      applyBuild: (payload) => {
        set((s) => {
          const next = {
            repo: payload.repo?.includes('/') ? payload.repo : s.repo,
            branch: payload.branch || s.branch || 'main',
            projectName: payload.projectName ?? s.projectName,
            html: payload.html ?? s.html,
            css: payload.css ?? s.css,
            js: payload.js ?? s.js,
            deployUrl: payload.deployUrl !== undefined ? payload.deployUrl : s.deployUrl,
            githubRepoUrl:
              payload.githubRepoUrl !== undefined ? payload.githubRepoUrl : s.githubRepoUrl,
            commitSha: payload.commitSha !== undefined ? payload.commitSha : s.commitSha,
            status: payload.status ?? s.status,
            previewOpen: payload.openPreview ?? s.previewOpen ?? true,
            lastUpdateAt: Date.now(),
            lastChanges: payload.changesSummary ?? s.lastChanges,
            lastFileTrail: payload.fileTrail ?? s.lastFileTrail,
            previousFiles:
              payload.previousFiles !== undefined ? payload.previousFiles : s.previousFiles,
          };
          persistPreview(next);
          return next;
        });
      },
      setStatus: (status) => set({ status }),
      setPreviewOpen: (previewOpen) => set({ previewOpen }),
      clearRollbackBuffer: () => set({ previousFiles: null }),
      hydratePreviewFromDisk: async () => {
        const blob = await loadPreviewBlob();
        if (!blob?.html?.trim()) return;
        const s = get();
        if (s.html?.trim()) return;
        set({
          html: blob.html,
          css: blob.css || '',
          js: blob.js || '',
          projectName: s.projectName || blob.projectName || s.projectName,
          repo: s.repo || blob.repo || s.repo,
          previewOpen: true,
        });
      },
      reset: () => set({ ...empty }),
    }),
    {
      name: 'xroga-project-workspace',
      // Metadata in localStorage; full HTML/CSS/JS in IndexedDB
      partialize: (s) => ({
        repo: s.repo,
        branch: s.branch,
        projectName: s.projectName,
        deployUrl: s.deployUrl,
        githubRepoUrl: s.githubRepoUrl,
        commitSha: s.commitSha,
        status: s.status,
        lastUpdateAt: s.lastUpdateAt,
        lastChanges: s.lastChanges,
      }),
    }
  )
);
