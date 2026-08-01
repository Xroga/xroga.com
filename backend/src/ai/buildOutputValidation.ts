import {
  extractDeletePaths,
  extractSearchReplacePatches,
} from './patches.js';
import {
  extractProjectFiles,
  extractSiteFiles,
  siteLooksComplete,
} from './siteBuilder.js';

export function buildOutputHasArtifacts(text: string, isUpdate: boolean): boolean {
  if (extractProjectFiles(text).length > 0) return true;
  const site = extractSiteFiles(text);
  if (site && siteLooksComplete(site)) return true;
  if (isUpdate) {
    return extractSearchReplacePatches(text).length > 0 || extractDeletePaths(text).length > 0;
  }
  return false;
}

/**
 * Build routes are not chat routes. A prose refusal, capability claim, or plan
 * is not a generated project and must fail over to another compatible model.
 */
export function requireBuildArtifacts(text: string, isUpdate: boolean): void {
  if (buildOutputHasArtifacts(text, isUpdate)) return;
  const error = new Error('Provider returned prose without executable project files') as Error & {
    code?: string;
  };
  error.code = 'INVALID_BUILD_OUTPUT';
  throw error;
}
