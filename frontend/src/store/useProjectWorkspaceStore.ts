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

export type DevWorkspaceTab = 'files' | 'code' | 'changes' | 'terminal' | 'preview' | 'deploy';

export interface FileTrailItem {
  path: string;
  before: string;
  after: string;
  added: number;
  removed: number;
}

export interface ProjectFileEntry {
  path: string;
  content: string;
  /** generated | modified | deleted | unchanged */
  flag?: 'generated' | 'modified' | 'deleted' | 'unchanged';
}

export interface ProjectWorkspaceState {
  repo: string | null;
  branch: string;
  projectName: string | null;
  html: string;
  css: string;
  js: string;
  /** Full project file map for Files/Code tabs */
  projectFiles: ProjectFileEntry[];
  deployUrl: string | null;
  githubRepoUrl: string | null;
  commitSha: string | null;
  status: ProjectWorkspaceStatus;
  previewOpen: boolean;
  workspaceOpen: boolean;
  activeTab: DevWorkspaceTab;
  openFilePath: string | null;
  openFilePaths: string[];
  terminalLog: string[];
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
    projectFiles?: ProjectFileEntry[];
    deployUrl?: string | null;
    githubRepoUrl?: string | null;
    commitSha?: string | null;
    status?: ProjectWorkspaceStatus;
    changesSummary?: string[];
    fileTrail?: FileTrailItem[];
    previousFiles?: Array<{ path: string; content: string }> | null;
    openPreview?: boolean;
    terminalLine?: string;
  }) => void;
  setProjectFiles: (files: ProjectFileEntry[]) => void;
  upsertFile: (path: string, content: string, flag?: ProjectFileEntry['flag']) => void;
  deleteFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
  setOpenFilePath: (path: string | null) => void;
  closeFileTab: (path: string) => void;
  setActiveTab: (tab: DevWorkspaceTab) => void;
  setWorkspaceOpen: (open: boolean) => void;
  setStatus: (status: ProjectWorkspaceStatus) => void;
  setPreviewOpen: (open: boolean) => void;
  appendTerminal: (line: string) => void;
  clearRollbackBuffer: () => void;
  hydratePreviewFromDisk: () => Promise<void>;
  reset: () => void;
}

function filesFromLanding(html: string, css: string, js: string): ProjectFileEntry[] {
  const out: ProjectFileEntry[] = [];
  if (html?.trim()) out.push({ path: 'index.html', content: html, flag: 'generated' });
  if (css?.trim()) out.push({ path: 'styles.css', content: css, flag: 'generated' });
  if (js?.trim()) out.push({ path: 'script.js', content: js, flag: 'generated' });
  return out;
}

const empty = {
  repo: null as string | null,
  branch: 'main',
  projectName: null as string | null,
  html: '',
  css: '',
  js: '',
  projectFiles: [] as ProjectFileEntry[],
  deployUrl: null as string | null,
  githubRepoUrl: null as string | null,
  commitSha: null as string | null,
  status: 'idle' as ProjectWorkspaceStatus,
  previewOpen: false,
  workspaceOpen: true,
  activeTab: 'preview' as DevWorkspaceTab,
  openFilePath: null as string | null,
  openFilePaths: [] as string[],
  terminalLog: [] as string[],
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
          const derived =
            payload.projectFiles && payload.projectFiles.length
              ? payload.projectFiles
              : filesFromLanding(payload.html ?? '', payload.css ?? '', payload.js ?? '');
          const mergedMap = new Map<string, ProjectFileEntry>();
          for (const f of s.projectFiles) mergedMap.set(f.path, f);
          for (const f of derived) {
            const prev = mergedMap.get(f.path);
            mergedMap.set(f.path, {
              path: f.path,
              content: f.content,
              flag: f.flag || (prev ? 'modified' : 'generated'),
            });
          }
          // Sync landing triad into map
          if (payload.html?.trim()) {
            mergedMap.set('index.html', {
              path: 'index.html',
              content: payload.html,
              flag: mergedMap.has('index.html') ? 'modified' : 'generated',
            });
          }
          if (payload.css?.trim()) {
            mergedMap.set('styles.css', {
              path: 'styles.css',
              content: payload.css,
              flag: mergedMap.has('styles.css') ? 'modified' : 'generated',
            });
          }
          if (payload.js?.trim()) {
            mergedMap.set('script.js', {
              path: 'script.js',
              content: payload.js,
              flag: mergedMap.has('script.js') ? 'modified' : 'generated',
            });
          }
          const projectFiles = Array.from(mergedMap.values()).sort((a, b) =>
            a.path.localeCompare(b.path)
          );
          const preferredOpen =
            s.openFilePath && projectFiles.some((f) => f.path === s.openFilePath)
              ? s.openFilePath
              : projectFiles[0]?.path || null;
          const next = {
            repo: payload.repo?.includes('/') ? payload.repo : s.repo,
            branch: payload.branch || s.branch || 'main',
            projectName: payload.projectName ?? s.projectName,
            html: payload.html ?? s.html,
            css: payload.css ?? s.css,
            js: payload.js ?? s.js,
            projectFiles,
            deployUrl: payload.deployUrl !== undefined ? payload.deployUrl : s.deployUrl,
            githubRepoUrl:
              payload.githubRepoUrl !== undefined ? payload.githubRepoUrl : s.githubRepoUrl,
            commitSha: payload.commitSha !== undefined ? payload.commitSha : s.commitSha,
            status: payload.status ?? s.status,
            previewOpen: payload.openPreview ?? s.previewOpen ?? true,
            workspaceOpen: true,
            activeTab: (payload.openPreview ? 'preview' : s.activeTab) as DevWorkspaceTab,
            openFilePath: preferredOpen,
            openFilePaths: preferredOpen
              ? Array.from(new Set([...(s.openFilePaths || []), preferredOpen]))
              : s.openFilePaths,
            terminalLog: payload.terminalLine
              ? [...s.terminalLog, payload.terminalLine].slice(-200)
              : s.terminalLog,
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
      setProjectFiles: (projectFiles) => set({ projectFiles }),
      upsertFile: (path, content, flag = 'modified') =>
        set((s) => {
          const map = new Map(s.projectFiles.map((f) => [f.path, f]));
          map.set(path, { path, content, flag });
          const projectFiles = Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
          const html = path === 'index.html' ? content : s.html;
          const css = path === 'styles.css' ? content : s.css;
          const js = path === 'script.js' ? content : s.js;
          persistPreview({ html, css, js, repo: s.repo, projectName: s.projectName });
          return {
            projectFiles,
            html,
            css,
            js,
            openFilePath: path,
            openFilePaths: Array.from(new Set([...s.openFilePaths, path])),
            lastUpdateAt: Date.now(),
          };
        }),
      deleteFile: (path) =>
        set((s) => {
          const projectFiles = s.projectFiles.filter((f) => f.path !== path);
          const openFilePaths = s.openFilePaths.filter((p) => p !== path);
          return {
            projectFiles,
            openFilePaths,
            openFilePath: s.openFilePath === path ? openFilePaths[0] || null : s.openFilePath,
          };
        }),
      renameFile: (from, to) =>
        set((s) => {
          const projectFiles = s.projectFiles.map((f) =>
            f.path === from ? { ...f, path: to, flag: 'modified' as const } : f
          );
          const openFilePaths = s.openFilePaths.map((p) => (p === from ? to : p));
          return {
            projectFiles,
            openFilePaths,
            openFilePath: s.openFilePath === from ? to : s.openFilePath,
          };
        }),
      setOpenFilePath: (openFilePath) =>
        set((s) => ({
          openFilePath,
          activeTab: 'code',
          openFilePaths:
            openFilePath && !s.openFilePaths.includes(openFilePath)
              ? [...s.openFilePaths, openFilePath]
              : s.openFilePaths,
        })),
      closeFileTab: (path) =>
        set((s) => {
          const openFilePaths = s.openFilePaths.filter((p) => p !== path);
          return {
            openFilePaths,
            openFilePath: s.openFilePath === path ? openFilePaths[0] || null : s.openFilePath,
          };
        }),
      setActiveTab: (activeTab) => set({ activeTab, workspaceOpen: true }),
      setWorkspaceOpen: (workspaceOpen) => set({ workspaceOpen }),
      setStatus: (status) => set({ status }),
      setPreviewOpen: (previewOpen) =>
        set({ previewOpen, workspaceOpen: true, activeTab: previewOpen ? 'preview' : get().activeTab }),
      appendTerminal: (line) =>
        set((s) => ({ terminalLog: [...s.terminalLog, line].slice(-200) })),
      clearRollbackBuffer: () => set({ previousFiles: null }),
      hydratePreviewFromDisk: async () => {
        const blob = await loadPreviewBlob();
        if (!blob?.html?.trim()) return;
        const s = get();
        if (s.html?.trim()) return;
        const projectFiles =
          s.projectFiles.length > 0
            ? s.projectFiles
            : filesFromLanding(blob.html, blob.css || '', blob.js || '');
        set({
          html: blob.html,
          css: blob.css || '',
          js: blob.js || '',
          projectFiles,
          projectName: s.projectName || blob.projectName || s.projectName,
          repo: s.repo || blob.repo || s.repo,
          previewOpen: true,
          workspaceOpen: true,
          openFilePath: projectFiles[0]?.path || 'index.html',
          openFilePaths: projectFiles[0]?.path ? [projectFiles[0].path] : ['index.html'],
        });
      },
      reset: () => set({ ...empty }),
    }),
    {
      name: 'xroga-project-workspace',
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
        workspaceOpen: s.workspaceOpen,
        activeTab: s.activeTab,
      }),
    }
  )
);
