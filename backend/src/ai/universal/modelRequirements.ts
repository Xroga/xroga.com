export interface TechnicalModelProfile {
  readonly id: string;
  readonly available: boolean;
  readonly contextTokens: number;
  readonly maximumOutputTokens: number;
  readonly features: Readonly<Record<string, boolean>>;
  readonly measured: Readonly<Record<string, { score: number; samples: number; confidence: number }>>;
  readonly inputMicroUsdPerToken: number;
  readonly outputMicroUsdPerToken: number;
}

export interface ModelRequirements {
  readonly contextTokens: number;
  readonly maximumOutputTokens: number;
  readonly features: readonly string[];
  readonly evidenceDimensions: readonly string[];
  readonly minimumSamples?: number;
  readonly minimumConfidence?: number;
}

export function routeModelByRequirements(requirements: ModelRequirements, profiles: readonly TechnicalModelProfile[]): TechnicalModelProfile | null {
  const eligible = profiles.filter((profile) => profile.available &&
    profile.contextTokens >= requirements.contextTokens &&
    profile.maximumOutputTokens >= requirements.maximumOutputTokens &&
    requirements.features.every((feature) => profile.features[feature] === true) &&
    requirements.evidenceDimensions.every((dimension) => {
      const evidence = profile.measured[dimension];
      return Boolean(evidence && evidence.samples >= (requirements.minimumSamples ?? 1) && evidence.confidence >= (requirements.minimumConfidence ?? 0));
    }));
  return eligible.sort((a, b) => {
    const score = (p: TechnicalModelProfile) => requirements.evidenceDimensions.reduce((sum, key) => sum + (p.measured[key]?.score ?? 0) * (p.measured[key]?.confidence ?? 0), 0);
    return score(b) - score(a) || (a.outputMicroUsdPerToken - b.outputMicroUsdPerToken) || a.id.localeCompare(b.id);
  })[0] ?? null;
}
