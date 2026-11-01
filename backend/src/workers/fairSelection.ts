/**
 * Fair selection of queued deliveries across tenants.
 *
 * Selecting the oldest N pending deliveries lets one tenant with many queued requests fill every dispatch tick, so another tenant's single request
 * waits behind all of them. This takes the same bounded number of deliveries but interleaves tenants round-robin: each tenant's own order is kept
 * (oldest first), tenants take turns, and the tenant whose oldest request is oldest goes first. It only chooses which already-eligible deliveries
 * the dispatcher is offered; the database reservation, capacity limit, attempt ceiling and authority checks are unchanged.
 */
export interface QueuedRow { readonly id: string; readonly user_id?: string | null; readonly created_at?: string }

export function selectFairly<T extends QueuedRow>(rows: readonly T[], limit: number): T[] {
  if (!(limit > 0)) return [];
  const byTenant = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.user_id ?? '';
    const list = byTenant.get(key);
    if (list) list.push(row); else byTenant.set(key, [row]);
  }
  // each tenant keeps its own oldest-first order; tenants start in the order of their oldest request
  const queues = [...byTenant.values()].map((list) => [...list].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))));
  queues.sort((a, b) => String(a[0]!.created_at ?? '').localeCompare(String(b[0]!.created_at ?? '')));
  const out: T[] = [];
  for (let round = 0; out.length < limit; round++) {
    let tookAny = false;
    for (const queue of queues) {
      const row = queue[round];
      if (row) { out.push(row); tookAny = true; if (out.length >= limit) break; }
    }
    if (!tookAny) break;
  }
  return out;
}
