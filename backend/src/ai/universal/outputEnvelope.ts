export interface ArtifactDescriptor {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly uri?: string;
  readonly inline?: string;
  readonly preview?: { kind: string; data?: Readonly<Record<string, unknown>> };
  readonly validation: readonly { validator: string; status: 'passed' | 'failed' | 'not_checked'; detail: string }[];
}

export interface UniversalOutputEnvelope {
  readonly type: 'xroga.output';
  readonly version: '1.0';
  readonly status: 'completed' | 'blocked' | 'failed' | 'partial';
  readonly summary: string;
  readonly artifacts: readonly ArtifactDescriptor[];
  readonly evidence: readonly { kind: string; detail: string }[];
  readonly blockers: readonly string[];
  readonly nextActions: readonly string[];
  readonly provenance: { runId: string; taskSessionId?: string; projectContextKey?: string };
}

export function validateOutputEnvelope(value: unknown): value is UniversalOutputEnvelope {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (row.type !== 'xroga.output' || row.version !== '1.0' || typeof row.summary !== 'string') return false;
  if (!Array.isArray(row.artifacts) || !Array.isArray(row.evidence) || !Array.isArray(row.blockers)) return false;
  return row.artifacts.every((artifact) => {
    if (!artifact || typeof artifact !== 'object') return false;
    const a = artifact as Record<string, unknown>;
    return typeof a.id === 'string' && typeof a.name === 'string' &&
      typeof a.mediaType === 'string' && /^[-\w.+]+\/[-\w.+]+$/.test(a.mediaType) &&
      typeof a.sizeBytes === 'number' && a.sizeBytes >= 0 && Array.isArray(a.validation);
  });
}

export class ArtifactFabric {
  readonly #generators = new Map<string, (input: unknown) => Promise<Omit<ArtifactDescriptor, 'validation'>>>();
  readonly #validators = new Map<string, (artifact: ArtifactDescriptor) => Promise<{ status: 'passed' | 'failed'; detail: string }>>();

  registerGenerator(mediaType: string, generator: (input: unknown) => Promise<Omit<ArtifactDescriptor, 'validation'>>): void {
    if (this.#generators.has(mediaType)) throw new Error(`Duplicate artifact generator for ${mediaType}`);
    this.#generators.set(mediaType, generator);
  }

  registerValidator(mediaType: string, validator: (artifact: ArtifactDescriptor) => Promise<{ status: 'passed' | 'failed'; detail: string }>): void {
    this.#validators.set(mediaType, validator);
  }

  async generate(mediaType: string, input: unknown): Promise<ArtifactDescriptor> {
    const generator = this.#generators.get(mediaType);
    if (!generator) throw new Error(`No trusted generator registered for ${mediaType}`);
    const base = await generator(input);
    if (base.mediaType !== mediaType) throw new Error('Artifact generator returned a different media type.');
    const candidate: ArtifactDescriptor = { ...base, validation: [] };
    const validator = this.#validators.get(mediaType);
    const validation = validator
      ? [{ validator: mediaType, ...(await validator(candidate)) }]
      : [{ validator: mediaType, status: 'not_checked' as const, detail: 'No validator registered.' }];
    return { ...candidate, validation };
  }
}
