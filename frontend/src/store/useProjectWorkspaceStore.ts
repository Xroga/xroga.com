'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { assertProjectTarget, isCurrentProjectTransition, normalizeProjectContext, projectContextKey, transitionProjectState, type ProjectContextIdentity, type ProjectTargetInput } from '@/lib/projectContext';
import { loadPreviewBlob, savePreviewBlob } from '@/lib/workspacePreviewStorage';
import { projectWorkspaceStorage } from '@/lib/projectWorkspaceStorage';

export type ProjectWorkspaceStatus = 'idle' | 'updating' | 'pushed' | 'live' | 'degraded';
export type DevWorkspaceTab = 'files' | 'code' | 'changes' | 'terminal' | 'preview' | 'deploy';
export interface FileTrailItem { path: string; before: string; after: string; added: number; removed: number }
export interface ProjectFileEntry { path: string; content: string; flag?: 'generated' | 'modified' | 'deleted' | 'unchanged' }

export interface ProjectWorkspaceSnapshot {
  repo: string | null; branch: string; projectRoot: string; projectName: string | null;
  html: string; css: string; js: string; projectFiles: ProjectFileEntry[];
  deployUrl: string | null; githubRepoUrl: string | null; commitSha: string | null;
  reviewBranch: string | null;
  status: ProjectWorkspaceStatus; previewOpen: boolean; workspaceOpen: boolean; activeTab: DevWorkspaceTab;
  openFilePath: string | null; openFilePaths: string[]; terminalLog: string[]; lastUpdateAt: number | null;
  lastChanges: string[]; lastFileTrail: FileTrailItem[]; previousFiles: Array<{ path: string; content: string }> | null;
}

export interface ProjectWorkspaceState extends ProjectWorkspaceSnapshot {
  activeProjectContext: ProjectContextIdentity | null;
  activeProjectContextKey: string | null;
  activeTaskSessionId: string | null;
  activeTaskSessionByProject: Record<string, string | null>;
  projectStates: Record<string, ProjectWorkspaceSnapshot>;
  transitionVersion: number;
  activateProjectContext: (target: ProjectTargetInput) => { key: string; version: number; changed: boolean };
  clearActiveProjectContext: () => void;
  setActiveTaskSession: (id: string | null, expectedKey?: string) => void;
  completeProjectContextRestore: (key: string, version: number, patch: Partial<ProjectWorkspaceSnapshot>) => boolean;
  assertActiveProjectTarget: (target: ProjectTargetInput) => ProjectContextIdentity;
  applyBuild: (payload: { repo?: string | null; branch?: string; projectRoot?: string; projectName?: string | null; html: string; css: string; js: string; projectFiles?: ProjectFileEntry[]; deployUrl?: string | null; githubRepoUrl?: string | null; commitSha?: string | null; reviewBranch?: string | null; status?: ProjectWorkspaceStatus; changesSummary?: string[]; fileTrail?: FileTrailItem[]; previousFiles?: Array<{ path: string; content: string }> | null; openPreview?: boolean; terminalLine?: string }) => void;
  setProjectFiles: (files: ProjectFileEntry[]) => void;
  upsertFile: (path: string, content: string, flag?: ProjectFileEntry['flag']) => void;
  deleteFile: (path: string) => void; renameFile: (from: string, to: string) => void;
  setOpenFilePath: (path: string | null) => void; closeFileTab: (path: string) => void;
  setActiveTab: (tab: DevWorkspaceTab) => void; setWorkspaceOpen: (open: boolean) => void;
  setStatus: (status: ProjectWorkspaceStatus) => void; setPreviewOpen: (open: boolean) => void;
  appendTerminal: (line: string) => void; clearRollbackBuffer: () => void;
  hydratePreviewFromDisk: () => Promise<void>; reset: () => void;
  resetForAccountBoundary: () => void;
}

function emptySnapshot(identity?: ProjectContextIdentity | null): ProjectWorkspaceSnapshot {
  return { repo: identity?.repo ?? null, branch: identity?.branch ?? 'main', projectRoot: identity?.projectRoot ?? '/', projectName: null,
    html: '', css: '', js: '', projectFiles: [], deployUrl: null, githubRepoUrl: null, commitSha: null, reviewBranch: null, status: 'idle',
    previewOpen: false, workspaceOpen: false, activeTab: 'preview', openFilePath: null, openFilePaths: [], terminalLog: [],
    lastUpdateAt: null, lastChanges: [], lastFileTrail: [], previousFiles: null };
}
const snapshotKeys: Array<keyof ProjectWorkspaceSnapshot> = ['repo','branch','projectRoot','projectName','html','css','js','projectFiles','deployUrl','githubRepoUrl','commitSha','reviewBranch','status','previewOpen','workspaceOpen','activeTab','openFilePath','openFilePaths','terminalLog','lastUpdateAt','lastChanges','lastFileTrail','previousFiles'];
function snapshotFrom(s: ProjectWorkspaceSnapshot): ProjectWorkspaceSnapshot {
  return Object.fromEntries(snapshotKeys.map((key) => [key, s[key]])) as unknown as ProjectWorkspaceSnapshot;
}
function landingFiles(html: string, css: string, js: string): ProjectFileEntry[] {
  return [['index.html', html], ['styles.css', css], ['script.js', js]].filter(([, value]) => value?.trim()).map(([path, content]) => ({ path, content, flag: 'generated' as const }));
}
function persistPreview(s: ProjectWorkspaceSnapshot) {
  if (!s.repo || !s.html.trim()) return;
  void savePreviewBlob({ html: s.html.slice(0, 400_000), css: s.css.slice(0, 200_000), js: s.js.slice(0, 200_000), repo: s.repo, projectName: s.projectName, updatedAt: Date.now() }, projectContextKey({ repo: s.repo, branch: s.branch, projectRoot: s.projectRoot }));
}

export const useProjectWorkspaceStore = create<ProjectWorkspaceState>()(persist((set, get) => {
  const update = (fn: (s: ProjectWorkspaceState) => Partial<ProjectWorkspaceSnapshot>) => set((s) => {
    const patch = fn(s); const next = { ...snapshotFrom(s), ...patch };
    return { ...patch, projectStates: s.activeProjectContextKey ? { ...s.projectStates, [s.activeProjectContextKey]: next } : s.projectStates };
  });
  return {
    ...emptySnapshot(), activeProjectContext: null, activeProjectContextKey: null, activeTaskSessionId: null, activeTaskSessionByProject: {}, projectStates: {}, transitionVersion: 0,
    activateProjectContext: (target) => {
      const current = get();
      const result = transitionProjectState({ activeKey: current.activeProjectContextKey, activeState: snapshotFrom(current), states: current.projectStates, version: current.transitionVersion, target, createClean: emptySnapshot });
      if (!result.changed) return { key: result.key, version: result.version, changed: false };
      const taskMap = { ...current.activeTaskSessionByProject };
      if (current.activeProjectContextKey) taskMap[current.activeProjectContextKey] = current.activeTaskSessionId;
      set({ ...result.activeState, repo: result.identity.repo, branch: result.identity.branch, projectRoot: result.identity.projectRoot, activeProjectContext: result.identity, activeProjectContextKey: result.key, activeTaskSessionId: taskMap[result.key] || null, activeTaskSessionByProject: taskMap, projectStates: result.states, transitionVersion: result.version });
      return { key: result.key, version: result.version, changed: true };
    },
    clearActiveProjectContext: () => {
      const current = get(); const projectStates = { ...current.projectStates };
      if (current.activeProjectContextKey) projectStates[current.activeProjectContextKey] = snapshotFrom(current);
      const taskMap = { ...current.activeTaskSessionByProject };
      if (current.activeProjectContextKey) taskMap[current.activeProjectContextKey] = current.activeTaskSessionId;
      set({ ...emptySnapshot(), activeProjectContext: null, activeProjectContextKey: null, activeTaskSessionId: null, activeTaskSessionByProject: taskMap, projectStates, transitionVersion: current.transitionVersion + 1 });
    },
    setActiveTaskSession: (id, expectedKey) => {
      if (expectedKey && expectedKey !== get().activeProjectContextKey) throw new Error('Task session belongs to a different project');
      const key = get().activeProjectContextKey;
      set((state) => ({ activeTaskSessionId: id, activeTaskSessionByProject: key ? { ...state.activeTaskSessionByProject, [key]: id } : state.activeTaskSessionByProject }));
    },
    completeProjectContextRestore: (key, version, patch) => {
      const current = get(); if (!isCurrentProjectTransition(current.activeProjectContextKey, current.transitionVersion, key, version)) return false;
      update(() => patch); return true;
    },
    assertActiveProjectTarget: (target) => assertProjectTarget(get().activeProjectContext, target),
    applyBuild: (payload) => {
      let state = get();
      if (payload.repo?.includes('/')) {
        const target = normalizeProjectContext({ repo: payload.repo, branch: payload.branch || state.branch, projectRoot: payload.projectRoot || '/' });
        if (!state.activeProjectContext) { get().activateProjectContext(target); state = get(); } else assertProjectTarget(state.activeProjectContext, target);
      }
      update((s) => {
        const merged = new Map(s.projectFiles.map((f) => [f.path, f]));
        for (const f of payload.projectFiles?.length ? payload.projectFiles : landingFiles(payload.html, payload.css, payload.js)) merged.set(f.path, { ...f, flag: f.flag || (merged.has(f.path) ? 'modified' : 'generated') });
        for (const [path, content] of [['index.html', payload.html], ['styles.css', payload.css], ['script.js', payload.js]] as const) if (content?.trim()) merged.set(path, { path, content, flag: merged.has(path) ? 'modified' : 'generated' });
        const projectFiles = [...merged.values()].sort((a,b) => a.path.localeCompare(b.path));
        const openFilePath = s.openFilePath && projectFiles.some((f) => f.path === s.openFilePath) ? s.openFilePath : projectFiles[0]?.path || null;
        const next: Partial<ProjectWorkspaceSnapshot> = { projectName: payload.projectName ?? s.projectName, html: payload.html ?? s.html, css: payload.css ?? s.css, js: payload.js ?? s.js, projectFiles,
          deployUrl: payload.deployUrl !== undefined ? payload.deployUrl : s.deployUrl, githubRepoUrl: payload.githubRepoUrl !== undefined ? payload.githubRepoUrl : s.githubRepoUrl, commitSha: payload.commitSha !== undefined ? payload.commitSha : s.commitSha, reviewBranch: payload.reviewBranch !== undefined ? payload.reviewBranch : s.reviewBranch,
          status: payload.status ?? s.status, previewOpen: payload.openPreview ?? s.previewOpen, workspaceOpen: true, activeTab: payload.openPreview ? 'preview' : s.activeTab, openFilePath,
          openFilePaths: openFilePath ? [...new Set([...s.openFilePaths, openFilePath])] : s.openFilePaths, terminalLog: payload.terminalLine ? [...s.terminalLog, payload.terminalLine].slice(-200) : s.terminalLog,
          lastUpdateAt: Date.now(), lastChanges: payload.changesSummary ?? s.lastChanges, lastFileTrail: payload.fileTrail ?? s.lastFileTrail, previousFiles: payload.previousFiles !== undefined ? payload.previousFiles : s.previousFiles };
        persistPreview({ ...snapshotFrom(s), ...next }); return next;
      });
    },
    setProjectFiles: (projectFiles) => update(() => ({ projectFiles })),
    upsertFile: (path, content, flag = 'modified') => update((s) => { const map = new Map(s.projectFiles.map((f) => [f.path, f])); map.set(path, { path, content, flag }); const next = { projectFiles: [...map.values()].sort((a,b) => a.path.localeCompare(b.path)), html: path === 'index.html' ? content : s.html, css: path === 'styles.css' ? content : s.css, js: path === 'script.js' ? content : s.js, openFilePath: path, openFilePaths: [...new Set([...s.openFilePaths, path])], lastUpdateAt: Date.now() }; persistPreview({ ...snapshotFrom(s), ...next }); return next; }),
    deleteFile: (path) => update((s) => { const paths = s.openFilePaths.filter((p) => p !== path); return { projectFiles: s.projectFiles.filter((f) => f.path !== path), openFilePaths: paths, openFilePath: s.openFilePath === path ? paths[0] || null : s.openFilePath }; }),
    renameFile: (from,to) => update((s) => ({ projectFiles: s.projectFiles.map((f) => f.path === from ? { ...f, path: to, flag: 'modified' } : f), openFilePaths: s.openFilePaths.map((p) => p === from ? to : p), openFilePath: s.openFilePath === from ? to : s.openFilePath })),
    setOpenFilePath: (path) => update((s) => ({ openFilePath: path, activeTab: 'code', openFilePaths: path && !s.openFilePaths.includes(path) ? [...s.openFilePaths, path] : s.openFilePaths })),
    closeFileTab: (path) => update((s) => { const paths = s.openFilePaths.filter((p) => p !== path); return { openFilePaths: paths, openFilePath: s.openFilePath === path ? paths[0] || null : s.openFilePath }; }),
    setActiveTab: (activeTab) => update(() => ({ activeTab, workspaceOpen: true })), setWorkspaceOpen: (workspaceOpen) => update(() => ({ workspaceOpen })), setStatus: (status) => update(() => ({ status })),
    setPreviewOpen: (previewOpen) => update((s) => ({ previewOpen, workspaceOpen: true, activeTab: previewOpen ? 'preview' : s.activeTab })), appendTerminal: (line) => update((s) => ({ terminalLog: [...s.terminalLog, line].slice(-200) })), clearRollbackBuffer: () => update(() => ({ previousFiles: null })),
    hydratePreviewFromDisk: async () => { const start = get(); if (!start.activeProjectContextKey || start.html.trim()) return; const key = start.activeProjectContextKey; const version = start.transitionVersion; const blob = await loadPreviewBlob(key); if (!blob?.html.trim() || (blob.repo && blob.repo !== start.repo)) return; const files = start.projectFiles.length ? start.projectFiles : landingFiles(blob.html, blob.css || '', blob.js || ''); get().completeProjectContextRestore(key, version, { html: blob.html, css: blob.css || '', js: blob.js || '', projectFiles: files, projectName: start.projectName || blob.projectName || null, previewOpen: true, workspaceOpen: true, openFilePath: files[0]?.path || 'index.html', openFilePaths: files[0]?.path ? [files[0].path] : ['index.html'] }); },
    reset: () => get().clearActiveProjectContext(),
    resetForAccountBoundary: () => set({
      ...emptySnapshot(), activeProjectContext: null, activeProjectContextKey: null,
      activeTaskSessionId: null, activeTaskSessionByProject: {}, projectStates: {},
      transitionVersion: get().transitionVersion + 1,
    }),
  };
}, { name: 'xroga-project-workspace', version: 3, storage: createJSONStorage(() => projectWorkspaceStorage),
  merge: (persisted, current) => {
    const saved = persisted as Partial<ProjectWorkspaceState>;
    // Async IndexedDB hydration may finish after a real user selection. Preserve
    // that newer transition while still recovering all other saved contexts.
    if (current.transitionVersion > 0) {
      return { ...saved, ...current, projectStates: { ...(saved.projectStates || {}), ...current.projectStates } };
    }
    return { ...current, ...saved, projectStates: { ...current.projectStates, ...(saved.projectStates || {}) } };
  },
  migrate: (persisted, version) => { const old = (persisted || {}) as Partial<ProjectWorkspaceState>; if (version >= 3) return { activeTaskSessionByProject: {}, ...old } as ProjectWorkspaceState; if (!old.repo?.includes('/')) return { ...old, ...emptySnapshot(), activeTaskSessionByProject: {} } as ProjectWorkspaceState; const identity = normalizeProjectContext({ repo: old.repo, branch: old.branch || 'main' }); const key = projectContextKey(identity); const snapshot = { ...emptySnapshot(identity), ...old } as ProjectWorkspaceSnapshot; return { ...old, ...snapshot, activeProjectContext: identity, activeProjectContextKey: key, activeTaskSessionId: null, activeTaskSessionByProject: {}, projectStates: { [key]: snapshot }, transitionVersion: 0 } as ProjectWorkspaceState; },
  partialize: (s) => ({ ...snapshotFrom(s), activeProjectContext: s.activeProjectContext, activeProjectContextKey: s.activeProjectContextKey, activeTaskSessionId: s.activeTaskSessionId, activeTaskSessionByProject: s.activeTaskSessionByProject, projectStates: s.projectStates, transitionVersion: s.transitionVersion }),
}));
