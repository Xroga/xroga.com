import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ProjectFile } from './api';
import { projectFilesForResume } from './projectResume';

function stored(
  path: string,
  content: string,
  version: number,
): ProjectFile {
  return {
    id: `${path}-${version}`,
    file_name: path,
    file_path: null,
    file_type: 'code',
    file_url: null,
    content,
    version,
    created_at: `2026-01-0${version}T00:00:00.000Z`,
  };
}

test('project resume restores arbitrary non-web files and selects the latest stored revision', () => {
  assert.deepEqual(
    projectFilesForResume([
      stored('cmd/main.go', 'old', 1),
      stored('README.md', 'docs', 1),
      stored('cmd/main.go', 'latest', 2),
    ]),
    [
      { path: 'cmd/main.go', content: 'latest' },
      { path: 'README.md', content: 'docs' },
    ],
  );
});
