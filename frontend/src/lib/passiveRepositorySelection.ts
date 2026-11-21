/** Passive account refreshes must not attach a GitHub repository to New Work.
 * A repository context exists only after the user selects or explicitly restores it. */
export function passiveRepositorySelection(input: {
  repositories: readonly string[];
  selected: string | null;
  fresh: boolean;
  projectSelected: boolean;
  defaultRepository?: string | null;
  repositoryLocked: boolean;
}): string | null {
  return input.selected && input.repositories.includes(input.selected)
    ? input.selected
    : null;
}
