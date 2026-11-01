import { calculateV2, type CalculatorNode } from './calculations';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const PREFIX = 'xroga:response-v2:scenario:';
const MAX_AGE = 8 * 60 * 60 * 1000;
type Entry = { id: string; signature: string; values: Record<string, string>; updated: number };
const signature = (node: CalculatorNode) => JSON.stringify([node.operation, node.inputs, node.unit, node.precision]);
const validValues = (node: CalculatorNode, value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const values = value as Record<string, string>;
  return Object.keys(values).length === node.inputs.length && node.inputs.every(input =>
    typeof values[input.id] === 'string' && values[input.id].length <= 64
  ) && calculateV2(node, values) !== null;
};
function entries(store: Store, scope: string, now: number): Entry[] {
  const raw = store.getItem(PREFIX + scope);
  if (!raw || raw.length > 100_000) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((entry): entry is Entry => Boolean(entry &&
    typeof entry.id === 'string' && typeof entry.signature === 'string' &&
    typeof entry.updated === 'number' && entry.updated <= now && now - entry.updated < MAX_AGE)).slice(-32) : [];
}
/** Tab-scoped numeric exploration only. Never persists answers, credentials or actions. */
export function restoreScenarioV2(store: Store, scope: string, node: CalculatorNode, now = Date.now()): Record<string, string> | null {
  try {
    const entry = entries(store, scope, now).find(item => item.id === node.id && item.signature === signature(node));
    return entry && validValues(node, entry.values) ? entry.values : null;
  } catch { return null; }
}
export function saveScenarioV2(store: Store, scope: string, node: CalculatorNode, values: Record<string, string>, now = Date.now()): void {
  if (!validValues(node, values)) return;
  try {
    const retained = entries(store, scope, now).filter(item => item.id !== node.id).slice(-31);
    store.setItem(PREFIX + scope, JSON.stringify([...retained, { id: node.id, signature: signature(node), values, updated: now }]));
  } catch { /* Storage denial or quota must not disable the calculator. */ }
}
