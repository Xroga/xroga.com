import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { useProjectWorkspaceStore } from './useProjectWorkspaceStore';

afterEach(() => {
  useProjectWorkspaceStore.getState().reset();
});

test('a canonical snapshot replaces the workspace so deleted and renamed-away files stay absent', () => {
  const store = useProjectWorkspaceStore.getState();

  store.activateProjectContext({
    repo: 'generated-owner/polyglot-product',
    branch: 'feature/arbitrary-snapshot',
    projectRoot: '/packages/core',
  });

  useProjectWorkspaceStore.getState().applyBuild({
    projectId: 'stable-project-id',
    html: '',
    css: '',
    js: '',
    projectFiles: [
      { path: 'src/old.ts', content: 'old' },
      { path: 'src/a.ts', content: 'renamed' },
      { path: 'src/app.ts', content: 'before' },
    ],
    replaceProjectFiles: true,
  });

  useProjectWorkspaceStore.getState().applyBuild({
    projectId: 'stable-project-id',
    html: '',
    css: '',
    js: '',
    projectFiles: [
      { path: 'src/b.ts', content: 'renamed' },
      { path: 'src/app.ts', content: 'after' },
      { path: 'src/new.ts', content: 'new' },
    ],
    replaceProjectFiles: true,
  });

  const current = useProjectWorkspaceStore.getState();
  assert.equal(current.projectId, 'stable-project-id');
  assert.deepEqual(
    current.projectFiles.map((file) => file.path),
    ['src/app.ts', 'src/b.ts', 'src/new.ts'],
  );
});

test('a changed-file payload remains a patch and is not mistaken for a full workspace', () => {
  const store = useProjectWorkspaceStore.getState();

  store.activateProjectContext({
    repo: 'different-owner/service-kit',
    branch: 'release/not-main',
    projectRoot: '/',
  });

  useProjectWorkspaceStore.getState().applyBuild({
    html: '',
    css: '',
    js: '',
    projectFiles: [
      { path: 'src/app.go', content: 'before' },
      { path: 'src/keep.go', content: 'keep' },
    ],
    replaceProjectFiles: true,
  });

  useProjectWorkspaceStore.getState().applyBuild({
    html: '',
    css: '',
    js: '',
    projectFiles: [{ path: 'src/app.go', content: 'after' }],
    replaceProjectFiles: false,
  });

  assert.deepEqual(
    useProjectWorkspaceStore.getState().projectFiles.map((file) => file.path),
    ['src/app.go', 'src/keep.go'],
  );
});

test('an empty canonical snapshot clears every previous project file', () => {
  const store = useProjectWorkspaceStore.getState();

  store.activateProjectContext({
    repo: 'third-owner/empty-output',
    branch: 'topic/empty',
    projectRoot: '/',
  });

  useProjectWorkspaceStore.getState().applyBuild({
    html: '',
    css: '',
    js: '',
    projectFiles: [{ path: 'obsolete.txt', content: 'remove me' }],
    replaceProjectFiles: true,
  });

  useProjectWorkspaceStore.getState().applyBuild({
    html: '',
    css: '',
    js: '',
    projectFiles: [],
    replaceProjectFiles: true,
  });

  assert.deepEqual(useProjectWorkspaceStore.getState().projectFiles, []);
});
