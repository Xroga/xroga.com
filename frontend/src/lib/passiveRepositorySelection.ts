/** A repository-list refresh may restore a default only before the user has
 * chosen an explicit task/project context. This is UI selection, not authority. */
export function passiveRepositorySelection(input: {
  repositories: readonly string[];
  selected: string | null;
  fresh: boolean;
  projectSelected: boolean;
  defaultRepository?: string | null;
  repositoryLocked: boolean;
}): string | null {
  if (input.selected && input.repositories.includes(input.selected)) return input.selected;
  if (input.fresh || input.projectSelected) return null;
  if (input.defaultRepository && input.repositories.includes(input.defaultRepository)) return input.defaultRepository;
  return input.repositoryLocked ? input.repositories[0] ?? null : null;
}
