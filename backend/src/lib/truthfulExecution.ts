export type ExecutionStatus =
  | 'completed'
  | 'in_progress'
  | 'queued'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'simulated'
  | 'not_configured';

export type EvidenceKind =
  | 'file'
  | 'command'
  | 'commit'
  | 'deployment'
  | 'api'
  | 'transaction'
  | 'connection'
  | 'preview'
  | 'asset'
  | 'source';

export interface OperationEvidence {
  kind: EvidenceKind;
  operation: string;
  ok: boolean;
  identifier?: string;
  timestamp: string;
  simulated?: boolean;
  details?: Record<string, string | number | boolean | null>;
}

export interface OperationStateInput {
  operation: string;
  attempted?: boolean;
  running?: boolean;
  queued?: boolean;
  cancelled?: boolean;
  blockedReason?: string;
  configured?: boolean;
  evidence?: OperationEvidence[];
}

export interface OperationState {
  operation: string;
  status: ExecutionStatus;
  evidence: OperationEvidence[];
  message: string;
}

const SECRET_VALUE_RE =
  /\b(gh[opsu]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+)/gi;

export function redactSecrets(value: string): string {
  return value.replace(SECRET_VALUE_RE, '[REDACTED]');
}

export function successfulEvidence(
  operation: string,
  evidence: OperationEvidence[] = [],
): OperationEvidence | undefined {
  return evidence.find(
    (item) => item.operation === operation && item.ok && !item.simulated && Boolean(item.timestamp),
  );
}

export function resolveOperationState(input: OperationStateInput): OperationState {
  const evidence = input.evidence ?? [];
  const proof = successfulEvidence(input.operation, evidence);

  if (input.cancelled) {
    return { operation: input.operation, status: 'cancelled', evidence, message: 'Cancelled' };
  }
  if (input.configured === false) {
    return {
      operation: input.operation,
      status: 'not_configured',
      evidence,
      message: input.blockedReason || 'Required provider or credentials are not configured',
    };
  }
  if (input.blockedReason) {
    return {
      operation: input.operation,
      status: 'blocked',
      evidence,
      message: redactSecrets(input.blockedReason),
    };
  }
  if (input.running) {
    return { operation: input.operation, status: 'in_progress', evidence, message: 'In progress' };
  }
  if (input.queued) {
    return { operation: input.operation, status: 'queued', evidence, message: 'Queued' };
  }
  if (proof) {
    return {
      operation: input.operation,
      status: 'completed',
      evidence,
      message: proof.identifier
        ? `Completed · ${redactSecrets(proof.identifier)}`
        : 'Completed with verified evidence',
    };
  }
  if (evidence.some((item) => item.simulated)) {
    return {
      operation: input.operation,
      status: 'simulated',
      evidence,
      message: 'Simulated result — no external operation was performed',
    };
  }
  if (input.attempted || evidence.some((item) => !item.ok)) {
    return {
      operation: input.operation,
      status: 'failed',
      evidence,
      message: 'Failed — no successful verification evidence',
    };
  }
  return {
    operation: input.operation,
    status: 'blocked',
    evidence,
    message: 'Not started — execution evidence is missing',
  };
}

export function createEvidence(
  evidence: Omit<OperationEvidence, 'timestamp'> & { timestamp?: string },
): OperationEvidence {
  return {
    ...evidence,
    timestamp: evidence.timestamp || new Date().toISOString(),
    identifier: evidence.identifier ? redactSecrets(evidence.identifier) : undefined,
  };
}

export function connectionIsVerified(input: {
  tokenPersisted: boolean;
  authenticatedProbeOk: boolean;
}): boolean {
  return input.tokenPersisted && input.authenticatedProbeOk;
}

export function previewIsReady(input: {
  persisted: boolean;
  serverReachable: boolean;
}): boolean {
  return input.persisted && input.serverReachable;
}

export function generatedFileIsSaved(input: {
  generated: boolean;
  persistenceSucceeded: boolean;
  persistedIdentifier?: string;
}): boolean {
  return (
    input.generated &&
    input.persistenceSucceeded &&
    Boolean(input.persistedIdentifier?.trim())
  );
}

export function assertRealResult<T>(
  value: T,
  evidence: OperationEvidence,
): T {
  if (!evidence.ok || evidence.simulated) {
    throw new Error(`Cannot publish ${evidence.operation} as completed without real evidence`);
  }
  return value;
}

