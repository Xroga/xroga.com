// Deterministic runner for apps that take commands in an editor (script consoles, command palettes, formula bars, code panes).
// The phases are fixed and ordered, every phase must return a typed receipt, a phase runs only when the earlier receipt allows it, and an unknown
// state stops the run. No model turn sits between phases; the caller supplies the app-specific implementations (an adapter), so the runner itself
// knows no site. Pure: it calls nothing but the adapter, so it is tested without Chrome. Execution authority stays with the caller's tool path.

export type Phase = 'discover' | 'targetEditor' | 'focus' | 'replaceText' | 'execute' | 'readOutput' | 'verify' | 'export';
export const PHASES: readonly Phase[] = ['discover', 'targetEditor', 'focus', 'replaceText', 'execute', 'readOutput', 'verify', 'export'];

export interface Receipt {
  phase: Phase;
  ok: boolean;
  /** What the app itself showed after the phase (page state, not the tool receipt). */
  observed: string;
  /** The phase finished but the state is not one the plan expects: the run stops. */
  unknown?: boolean;
  note?: string;
}

export interface CommandSurface {
  /** Optional phases may be left out (for example export when no file is wanted). */
  discover(): Promise<Receipt>;
  targetEditor(): Promise<Receipt>;
  focus(): Promise<Receipt>;
  /** Must replace, never append: the editor may open with example text. */
  replaceText(text: string): Promise<Receipt>;
  execute(): Promise<Receipt>;
  readOutput(): Promise<Receipt>;
  verify(output: string): Promise<Receipt>;
  export?(): Promise<Receipt>;
}

export interface SurfaceRequest {
  text: string;
  /** When true the export phase runs and must succeed. */
  exportResult?: boolean;
  /** Bound on adapter calls for the whole run; a runner cannot loop. */
  maxCalls?: number;
}

export interface SurfaceResult {
  ok: boolean;
  receipts: Receipt[];
  stoppedAt?: Phase;
  reason?: string;
}

/** A run with an identical program on an identical document must not run twice (the duplicate-document guard). */
export class RunLedger {
  readonly #done = new Set<string>();
  key(documentId: string, text: string): string {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `${documentId}:${(h >>> 0).toString(36)}:${text.length}`;
  }
  has(documentId: string, text: string): boolean { return this.#done.has(this.key(documentId, text)); }
  add(documentId: string, text: string): void { this.#done.add(this.key(documentId, text)); }
}

export async function runSurface(surface: CommandSurface, request: SurfaceRequest, ledger?: RunLedger, documentId = 'doc'): Promise<SurfaceResult> {
  const receipts: Receipt[] = [];
  const budget = request.maxCalls ?? PHASES.length;
  if (!request.text) return { ok: false, receipts, reason: 'no program text was given' };
  if (ledger?.has(documentId, request.text)) return { ok: false, receipts, stoppedAt: 'execute', reason: 'this program already ran on this document; read its output or change it, do not run it again' };
  let output = '';
  for (const phase of PHASES) {
    if (phase === 'export' && (!request.exportResult || !surface.export)) continue;
    if (receipts.length >= budget) return { ok: false, receipts, stoppedAt: phase, reason: 'call budget used up' };
    let receipt: Receipt;
    try {
      receipt = phase === 'replaceText' ? await surface.replaceText(request.text)
        : phase === 'verify' ? await surface.verify(output)
        : phase === 'export' ? await surface.export!()
        : await surface[phase]();
    } catch (error) {
      receipt = { phase, ok: false, observed: '', note: error instanceof Error ? error.message : String(error) };
    }
    receipts.push(receipt);
    if (!receipt.ok) return { ok: false, receipts, stoppedAt: phase, reason: receipt.note ?? `${phase} failed` };
    if (receipt.unknown) return { ok: false, receipts, stoppedAt: phase, reason: `unknown state after ${phase}: ${receipt.observed.slice(0, 200)}` };
    if (phase === 'execute') ledger?.add(documentId, request.text);
    if (phase === 'readOutput') output = receipt.observed;
  }
  return { ok: true, receipts };
}
