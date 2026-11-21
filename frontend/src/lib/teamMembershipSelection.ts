export type TeamResponse<T> = { teamId: string; revision: number; data: T };

/** A late or invalidated roster never renders under a different team or revision. */
export function currentTeamResponse<T>(response: TeamResponse<T> | null, activeTeamId: string | undefined, revision: number): T | null {
  return response && response.teamId === activeTeamId && response.revision === revision ? response.data : null;
}
