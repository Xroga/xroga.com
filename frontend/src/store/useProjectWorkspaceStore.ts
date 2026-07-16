'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

/** One live project workspace per selected repo — Plan A single preview surface. */
export const useProjectWorkspaceStore = create<ProjectWorkspaceState>()(
  persist(
    (set) => ({
      ...empty,
      applyBuild: (payload) =>
        set((s) => ({
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
        })),
      setStatus: (status) => set({ status }),
      setPreviewOpen: (previewOpen) => set({ previewOpen }),
      clearRollbackBuffer: () => set({ previousFiles: null }),
      reset: () => set({ ...empty }),
    }),
    {
      name: 'xroga-project-workspace',
      // Never persist full HTML/CSS/JS in localStorage — that bloated refresh + corrupted sessions
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
