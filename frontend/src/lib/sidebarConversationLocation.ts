/** GitHub repository identity is never a substitute for explicit Project membership. */
export function belongsToProject(projectId: string | null | undefined, target: string): boolean {
  return Boolean(projectId && target && projectId === target);
}
export function isRecentWithoutProject(projectId: string | null | undefined): boolean {
  // The database sets project_id to NULL when a Project is deleted. An assigned
  // conversation must not reappear in Recents just because Projects is paginated.
  return !projectId;
}
