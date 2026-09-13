import { createHash } from 'node:crypto';

import type {
  FileMutationResult,
  FileWriteIntent,
  ProjectFileContent,
  ProjectFileSummary,
} from './toolHost.js';

export interface SoftwareAgentWorkspaceFile {
  path: string;
  content: string;
}

export interface SoftwareAgentWorkspaceChange {
  path: string;

  kind:
    | 'created'
    | 'modified'
    | 'deleted';

  before?: string;
  after?: string;
}

function normalizePath(input: string): string {
  const value = input
    .trim()
    .replace(/\\/g, '/');

  if (
    !value ||
    value.startsWith('/')
  ) {
    throw new Error(
      `Invalid workspace path: ${input}`,
    );
  }

  const parts = value.split('/');

  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..',
    )
  ) {
    throw new Error(
      `Invalid workspace path: ${input}`,
    );
  }

  return parts.join('/');
}

function revisionFor(
  content: string,
): string {
  return createHash('sha256')
    .update(content)
    .digest('hex');
}

function lineCount(
  content: string | undefined,
): number {
  if (!content) {
    return 0;
  }

  return content.split(/\r?\n/).length;
}

/**
 * One coherent mutable workspace for one software-agent run.
 *
 * Important:
 *
 * - baseFiles never mutate
 * - workingFiles represent the agent's current project
 * - tools see changes immediately
 * - GitHub persistence happens only after verification
 *
 * This prevents:
 *
 * model edits file A
 * ↓
 * validator reads an older repository snapshot
 * ↓
 * Preview sees another snapshot
 */
export class SoftwareAgentWorkspace {
  private readonly baseFiles =
    new Map<string, string>();

  private readonly workingFiles =
    new Map<string, string>();

  constructor(
    files: SoftwareAgentWorkspaceFile[],
  ) {
    for (const file of files) {
      const path =
        normalizePath(file.path);

      this.baseFiles.set(
        path,
        file.content,
      );

      this.workingFiles.set(
        path,
        file.content,
      );
    }
  }

  listFiles(): ProjectFileSummary[] {
    return [...this.workingFiles.entries()]
      .map(([path, content]) => ({
        path,
        size: Buffer.byteLength(
          content,
          'utf8',
        ),
      }))
      .sort((a, b) =>
        a.path.localeCompare(b.path),
      );
  }

  hasFile(path: string): boolean {
    return this.workingFiles.has(
      normalizePath(path),
    );
  }

  readFile(
    path: string,
  ): ProjectFileContent {
    const normalizedPath =
      normalizePath(path);

    const content =
      this.workingFiles.get(
        normalizedPath,
      );

    if (content === undefined) {
      throw new Error(
        `FILE_NOT_FOUND: ${normalizedPath}`,
      );
    }

    return {
      path: normalizedPath,
      content,
    };
  }

  readFiles(
    paths: string[],
  ): ProjectFileContent[] {
    return paths.map((path) =>
      this.readFile(path),
    );
  }

  search(
    query: string,
    maxResults = 50,
  ): Array<{
    path: string;
    line?: number;
    preview?: string;
  }> {
    const needle =
      query.trim().toLowerCase();

    if (!needle) {
      return [];
    }

    const results: Array<{
      path: string;
      line?: number;
      preview?: string;
    }> = [];

    for (
      const [path, content]
      of this.workingFiles
    ) {
      const lines =
        content.split(/\r?\n/);

      for (
        let index = 0;
        index < lines.length;
        index += 1
      ) {
        const line =
          lines[index] ?? '';

        if (
          line
            .toLowerCase()
            .includes(needle)
        ) {
          results.push({
            path,
            line: index + 1,
            preview: line
              .trim()
              .slice(0, 300),
          });

          if (
            results.length >=
            maxResults
          ) {
            return results;
          }
        }
      }
    }

    return results;
  }

  writeFile(
    path: string,
    content: string,
    intent: FileWriteIntent,
  ): FileMutationResult {
    const normalizedPath =
      normalizePath(path);

    const exists =
      this.workingFiles.has(
        normalizedPath,
      );

    if (
      intent === 'create' &&
      exists
    ) {
      throw new Error(
        `CREATE_CONFLICT: ${normalizedPath}`,
      );
    }

    if (
      intent === 'modify' &&
      !exists
    ) {
      throw new Error(
        `MODIFY_TARGET_MISSING: ${normalizedPath}`,
      );
    }

    const previous =
      this.workingFiles.get(
        normalizedPath,
      );

    this.workingFiles.set(
      normalizedPath,
      content,
    );

    return {
      path: normalizedPath,

      revision:
        revisionFor(content),

      created: !exists,

      additions:
        Math.max(
          0,
          lineCount(content) -
            lineCount(previous),
        ),

      deletions:
        Math.max(
          0,
          lineCount(previous) -
            lineCount(content),
        ),
    };
  }

  deleteFile(
    path: string,
  ): {
    path: string;
    deleted: boolean;
  } {
    const normalizedPath =
      normalizePath(path);

    if (
      !this.workingFiles.has(
        normalizedPath,
      )
    ) {
      return {
        path: normalizedPath,
        deleted: false,
      };
    }

    this.workingFiles.delete(
      normalizedPath,
    );

    return {
      path: normalizedPath,
      deleted: true,
    };
  }

  getFiles():
    SoftwareAgentWorkspaceFile[] {
    return [...this.workingFiles.entries()]
      .map(([path, content]) => ({
        path,
        content,
      }))
      .sort((a, b) =>
        a.path.localeCompare(b.path),
      );
  }

  getChanges():
    SoftwareAgentWorkspaceChange[] {
    const paths = new Set([
      ...this.baseFiles.keys(),
      ...this.workingFiles.keys(),
    ]);

    const changes:
      SoftwareAgentWorkspaceChange[] =
      [];

    for (const path of paths) {
      const before =
        this.baseFiles.get(path);

      const after =
        this.workingFiles.get(path);

      if (
        before === undefined &&
        after !== undefined
      ) {
        changes.push({
          path,
          kind: 'created',
          after,
        });

        continue;
      }

      if (
        before !== undefined &&
        after === undefined
      ) {
        changes.push({
          path,
          kind: 'deleted',
          before,
        });

        continue;
      }

      if (
        before !== after
      ) {
        changes.push({
          path,
          kind: 'modified',
          before,
          after,
        });
      }
    }

    return changes.sort((a, b) =>
      a.path.localeCompare(b.path),
    );
  }

  getChangedPaths(): string[] {
    return this.getChanges().map(
      (change) => change.path,
    );
  }

  hasChanges(): boolean {
    return (
      this.getChanges().length > 0
    );
  }

  reset(): void {
    this.workingFiles.clear();

    for (
      const [path, content]
      of this.baseFiles
    ) {
      this.workingFiles.set(
        path,
        content,
      );
    }
  }
}
