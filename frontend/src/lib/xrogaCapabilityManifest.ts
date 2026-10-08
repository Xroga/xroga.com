/** Data-only capabilities exposed to model-authored response blocks. */
export const modelBlockCapabilities = [
  'notice', 'status', 'error', 'empty-state', 'code', 'diff', 'terminal', 'file', 'citation', 'source',
  'metric', 'metric-group', 'table', 'chart', 'timeline', 'graph', 'map', 'form', 'choice',
  'gallery', 'image', 'audio', 'video', 'dashboard', 'document', 'spreadsheet', 'presentation',
  'board', 'database', 'pdf', 'progress', 'progress-group', 'calculator', 'calculation', 'gauge',
  'comparison', 'key-value', 'checklist', 'steps', 'scorecard', 'ranking', 'tabs', 'accordion',
  'file-tree', 'calendar', 'source-list', 'card-grid', 'tree', 'json', 'api-request',
  'decision-matrix',
] as const;

export type ModelBlockCapability = typeof modelBlockCapabilities[number];
export const modelBlockCapabilitySet: ReadonlySet<string> = new Set(modelBlockCapabilities);

export const decisionMatrixCapability = {
  type: 'decision-matrix',
  schemaVersion: 1,
  label: 'Decision matrix',
  description: 'Compare supplied option scores using adjustable criterion weights.',
  canView: true,
  canCreate: true,
  canEdit: false,
  canExport: false,
  canShare: false,
  effect: 'local-only',
} as const;
