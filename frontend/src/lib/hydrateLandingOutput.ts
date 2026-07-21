import type { LandingPageOutputData } from '@/lib/landingPageOutput';
import { api } from '@/lib/api';

/** Load html/css/js from GitHub or cloud project storage when restore snapshot stripped code. */
export async function hydrateLandingOutput(
  data: LandingPageOutputData,
  projectId?: string
): Promise<LandingPageOutputData> {
  const hasCode = (data.html?.length ?? 0) > 80;
  if (hasCode) return data;

  if (data.githubRepoName) {
    try {
      const files = await api.github.getBuildFiles(data.githubRepoName);
      if (files.html?.trim()) {
        return { ...data, html: files.html, css: files.css ?? '', js: files.js ?? '' };
      }
    } catch {
      /* try project storage */
    }
  }

  if (projectId) {
    try {
      const stored = await api.projects.getCode(projectId);
      const byName = Object.fromEntries(
        (stored.files ?? []).map((f) => [f.file_name.replace(/_/g, '/'), f.content ?? ''])
      );
      const html = byName['index.html'] ?? '';
      if (html.trim()) {
        return {
          ...data,
          html,
          css: byName['styles.css'] ?? data.css ?? '',
          js: byName['script.js'] ?? data.js ?? '',
        };
      }
    } catch {
      /* no stored code */
    }
  }

  return data;
}
