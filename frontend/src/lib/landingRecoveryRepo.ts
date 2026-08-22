const scopedRepository = (value: unknown): string =>
  typeof value === 'string' && value.includes('/') ? value : '';

/** Prefer artifact evidence, then message evidence, then the terminal's sticky repo binding. */
export function resolveLandingRecoveryRepo(
  featureRepository: unknown,
  messageRepository: unknown,
  terminalRepository?: string
): string {
  return (
    scopedRepository(featureRepository) ||
    scopedRepository(messageRepository) ||
    scopedRepository(terminalRepository)
  );
}
