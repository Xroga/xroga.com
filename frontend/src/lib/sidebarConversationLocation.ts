/** GitHub repository identity is never a substitute for explicit Project membership. */
export function belongsToProject(projectId: string | null | undefined, target: string): boolean {
  return Boolean(projectId && target && projectId === target);
}
export function isRecentWithoutProject(
  projectId: string | null | undefined,
  validProjects: ReadonlySet<string>,
): boolean {
  return !projectId || !validProjects.has(projectId);
}
