/** Prevent replaying a large painted-editor input only when Chrome actually dispatched it.
 * A refused attempt (documentation gate, focus error, validation error) must never poison
 * later retries. Key by full text and tab: scripts sharing their first 200 characters
 * can be different, and another tab is a separate editing target.
 *
 * In-memory run state only. No source text is persisted or shared across users.
 */
export interface PaintedTypeDispatch {
  ok: boolean;
  receipt?: { dispatched?: boolean | 'unknown' };
}

export class PaintedInputDeliveryGuard {
  readonly #delivered = new Set<string>();

  #key(tabId: number | null | undefined, text: string): string {
    return JSON.stringify([typeof tabId === 'number' ? tabId : null, text]);
  }

  wasDelivered(tabId: number | null | undefined, text: string): boolean {
    return this.#delivered.has(this.#key(tabId, text));
  }

  record(tabId: number | null | undefined, text: string, result: PaintedTypeDispatch | undefined): boolean {
    if (!result?.ok || result.receipt?.dispatched !== true) return false;
    this.#delivered.add(this.#key(tabId, text));
    return true;
  }
}
