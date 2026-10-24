import { createHash } from 'node:crypto';

/** Pure namespace policy shared by the actual provider adapter and its
 * frontend contract tests. Never imports server custody or database clients. */
export function xrogaCustomUserToken(userId: string): string {
  return createHash('sha256').update(userId.trim()).digest('hex').slice(0, 12);
}
export function xrogaCustomToolkitPrefix(userId: string): string {
  return `custom_xroga_${xrogaCustomUserToken(userId)}_`;
}
export function canUserAccessComposioToolkit(userId: string, toolkitSlug: string): boolean {
  const clean = toolkitSlug.trim().toLowerCase();
  if (clean === 'composio' || clean.startsWith('composio_') || clean === 'code_interpreter' || clean === 'codeinterpreter') return false;
  return !clean.startsWith('custom_') || clean.startsWith(xrogaCustomToolkitPrefix(userId));
}
export function canUserAccessComposioToolSlug(userId: string, toolSlug: string): boolean {
  const clean = toolSlug.trim().toLowerCase();
  return !clean.startsWith('custom_') || clean.startsWith(xrogaCustomToolkitPrefix(userId));
}
