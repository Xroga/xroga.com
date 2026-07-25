export interface ProviderCandidate {
  id: string;
  configured: boolean;
  healthy?: boolean;
  supports: string[];
  priority?: number;
  failureReason?: string;
}

export interface ProviderResolution {
  selected: string | null;
  status: 'selected' | 'blocked';
  attempted: string[];
  reason: string;
  blocker?: string;
}

export function resolveHealthyProvider(
  operation: string,
  candidates: ProviderCandidate[],
  preferredId?: string,
): ProviderResolution {
  const supported = candidates
    .filter((candidate) => candidate.supports.includes(operation))
    .sort((a, b) => {
      if (a.id === preferredId) return -1;
      if (b.id === preferredId) return 1;
      return (a.priority ?? 100) - (b.priority ?? 100);
    });
  const attempted = supported.map((candidate) => candidate.id);
  const selected = supported.find(
    (candidate) => candidate.configured && candidate.healthy === true,
  );
  if (selected) {
    const preferredFailed =
      preferredId && selected.id !== preferredId
        ? supported.find((candidate) => candidate.id === preferredId)
        : undefined;
    return {
      selected: selected.id,
      status: 'selected',
      attempted,
      reason: preferredFailed
        ? `${preferredId} was unavailable (${preferredFailed.failureReason || 'health check failed'}); using healthy fallback ${selected.id}.`
        : `Selected configured, healthy provider ${selected.id}.`,
    };
  }
  const reasons = supported.map(
    (candidate) =>
      `${candidate.id}: ${
        !candidate.configured
          ? 'not configured'
          : candidate.failureReason || (candidate.healthy === undefined ? 'runtime health not verified' : 'health check failed')
      }`,
  );
  return {
    selected: null,
    status: 'blocked',
    attempted,
    reason: `No usable provider supports ${operation}.`,
    blocker: reasons.length
      ? `Provider checks failed — ${reasons.join('; ')}.`
      : `No registered provider supports ${operation}.`,
  };
}
