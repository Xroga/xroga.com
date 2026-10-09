/** Future data contract only. Command 1 never instantiates a live adapter. */
export interface FounderDiagnosticRecord {
  id: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  environment: string;
  correlationId: string | null;
  summary: string; // sanitized and tenant-scoped; never raw payload or trace
  impact: string;
  retryStatus: 'not-applicable' | 'pending' | 'attempted' | 'resolved';
  owner: string | null;
  nextAction: string;
}
export interface FounderDiagnosticsAdapter {
  list: (input: { category: string; severity?: FounderDiagnosticRecord['severity']; environment?: string; limit: number }) => Promise<{ state: 'ready' | 'not-connected'; records: FounderDiagnosticRecord[] }>;
}
