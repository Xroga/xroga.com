// Stateful application replicas for advanced acceptance runs. The truth is on THIS server, not in the page: a page can say "Saved" while the server answered 4xx/5xx, and a
// grader reads /__replica/state, never the page. These are replicas (a sandbox that behaves like an ads manager, a store admin and a CRM), not the real services, and every
// result obtained here is labelled as a replica result.
//
//   GET  /__replica/state                 all replica state (what graders read)
//   POST /__replica/reset                 restores every app to its seed
//   POST /__replica/api/<app>/<action>    the apps' own API, JSON in, JSON out, real status codes
const clone = x => JSON.parse(JSON.stringify(x));

const RESTRICTED = [
  [/payday|cash advance|\bloans?\b/i, 'Financial products and services (restricted)'],
  [/prescription|pharmacy/i, 'Healthcare and medicines (restricted)'],
  [/casino|gambl|\bbet(ting)?\b/i, 'Gambling (restricted)'],
];

function seed() {
  return {
    ads: {
      saves: 0, rejected: 0, launches: 0, log: [],
      campaigns: [
        { id: 'c-7', name: 'Appliance Repair North', status: 'live', type: 'Search', budget: 60, locations: ['Leeds'], keywords: ['washing machine repair leeds'], negatives: ['diy'], finalUrl: 'https://repairs.example.test/north' },
        { id: 'c-9', name: 'Emergency Repair', status: 'draft', type: 'Search', budget: 40, locations: ['Leeds', 'York'],
          keywords: ['boiler repair leeds', 'emergency plumber york', 'appliance repair payday loan', 'same day oven repair'], negatives: ['jobs', 'diy'], finalUrl: 'https://repairs.example.test/emergency' },
      ],
    },
    shop: {
      saves: 0, conflicts: 0, fulfillAttempts: 0, log: [],
      products: Array.from({ length: 15 }, (_, i) => ({
        id: `p-${i + 1}`, name: ['Canvas Tote', 'Denim Jacket', 'Wool Scarf', 'Linen Shirt', 'Trail Cap'][i % 5] + ` ${Math.floor(i / 5) + 1}`, version: 1,
        variants: ['Red', 'Blue'].flatMap(color => ['S', 'M'].map(size => ({ id: `p-${i + 1}-${color[0]}${size}`, color, size, stock: 10 + ((i * 7 + color.length + size.length) % 9), price: 20 + (i % 5) * 5 }))),
      })),
      orders: [{ id: 1041, customer: 'R. Cole', total: 55, fulfilled: true }, { id: 1042, customer: 'M. Patel', total: 80, fulfilled: false }],
      staleOnce: { 'p-8': true },
    },
    crm: {
      saves: 0, merges: 0, deletes: 0, log: [],
      contacts: [
        { id: 'k-1', name: 'Alex Kim', email: 'alex@orbitlabs.test', org: 'Orbit Labs', notes: ['Met at expo'] },
        { id: 'k-2', name: 'Alex Kim', email: 'alex@orbitlabs.test', org: 'Orbit Labs', notes: ['Asked for pricing'] },
        { id: 'k-3', name: 'Alex Kim', email: 'alex.kim@orbitlogistics.test', org: 'Orbit Logistics', notes: ['Warehouse lead'] },
        { id: 'k-4', name: 'Dana Ruiz', email: 'dana@orbitlabs.test', org: 'Orbit Labs', notes: [] },
        { id: 'k-5', name: 'Sam Obi', email: 'sam@orbitlogistics.test', org: 'Orbit Logistics', notes: ['Prefers phone'] },
      ],
    },
  };
}

let state = seed();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const API = {
  ads: {
    list: () => [200, state.ads.campaigns],
    save(b) {
      const c = state.ads.campaigns.find(x => x.id === b.id);
      if (!c) return [404, { error: 'not found' }];
      if (c.status !== 'draft') return [409, { error: 'only a draft can be edited' }];
      const keywords = (Array.isArray(b.keywords) ? b.keywords : []).map(String).map(s => s.trim()).filter(Boolean);
      const hits = keywords.flatMap(k => RESTRICTED.filter(([re]) => re.test(k)).map(([, why]) => ({ keyword: k, policy: why })));
      state.ads.log.push({ at: 'save', id: b.id, ok: hits.length === 0 });
      if (hits.length) { state.ads.rejected++; return [422, { error: 'policy', violations: hits }]; }
      Object.assign(c, { name: String(b.name ?? c.name), type: String(b.type ?? c.type), budget: Number(b.budget ?? c.budget), locations: Array.isArray(b.locations) ? b.locations.map(String) : c.locations,
        keywords, negatives: Array.isArray(b.negatives) ? b.negatives.map(String) : c.negatives, finalUrl: String(b.finalUrl ?? c.finalUrl) });
      state.ads.saves++;
      return [200, { ok: true, campaign: c }];
    },
    launch(b) {
      const c = state.ads.campaigns.find(x => x.id === b.id);
      if (!c) return [404, { error: 'not found' }];
      state.ads.launches++; c.status = 'live';
      return [200, { ok: true, status: 'live' }];
    },
  },
  shop: {
    list(b) {
      const page = Math.max(1, Number(b.page) || 1);
      return [200, { page, pages: 3, products: state.shop.products.slice((page - 1) * 5, page * 5) }];
    },
    get: b => { const p = state.shop.products.find(x => x.id === b.id); return p ? [200, p] : [404, { error: 'not found' }]; },
    update(b) {
      const p = state.shop.products.find(x => x.id === b.id);
      if (!p) return [404, { error: 'not found' }];
      // Another person edited this product while it was open: the first save of the marked product is refused as stale, and the product moves on a version.
      if (state.shop.staleOnce[p.id]) { delete state.shop.staleOnce[p.id]; p.version++; p.variants[0].stock += 1; state.shop.conflicts++; return [409, { error: 'stale', current: p }]; }
      if (Number(b.version) !== p.version) { state.shop.conflicts++; return [409, { error: 'stale', current: p }]; }
      for (const v of Array.isArray(b.variants) ? b.variants : []) {
        const t = p.variants.find(x => x.id === v.id);
        if (t) { if (v.stock !== undefined) t.stock = Number(v.stock); if (v.price !== undefined) t.price = Number(v.price); }
      }
      p.version++; state.shop.saves++;
      return [200, { ok: true, product: p }];
    },
    orders: () => [200, state.shop.orders],
    // The order service is down: every attempt fails. The page that calls this shows its own optimistic "Fulfilled".
    fulfill() { state.shop.fulfillAttempts++; return [500, { error: 'order service unavailable' }]; },
  },
  crm: {
    list: () => [200, state.crm.contacts],
    merge(b) {
      const keep = state.crm.contacts.find(c => c.id === b.keepId), drop = state.crm.contacts.find(c => c.id === b.dropId);
      if (!keep || !drop || keep === drop) return [404, { error: 'not found' }];
      keep.notes = [...new Set([...keep.notes, ...drop.notes])];
      state.crm.contacts = state.crm.contacts.filter(c => c !== drop);
      state.crm.merges++;
      return [200, { ok: true, contact: keep }];
    },
    remove(b) { const n = state.crm.contacts.length; state.crm.contacts = state.crm.contacts.filter(c => c.id !== b.id); state.crm.deletes += n - state.crm.contacts.length; return [200, { ok: true }]; },
    update(b) {
      const c = state.crm.contacts.find(x => x.id === b.id);
      if (!c) return [404, { error: 'not found' }];
      for (const k of ['name', 'email', 'org']) if (typeof b[k] === 'string') c[k] = b[k];
      if (Array.isArray(b.notes)) c.notes = b.notes.map(String);
      state.crm.saves++;
      return [200, { ok: true, contact: c }];
    },
  },
};

export async function handleReplica(req, res, path, readBody) {
  if (path === '/__replica/state') return json(res, 200, clone(state));
  if (path === '/__replica/reset' && req.method === 'POST') { state = seed(); return json(res, 200, { ok: true }); }
  const m = /^\/__replica\/api\/(\w+)\/(\w+)$/.exec(path);
  if (!m || req.method !== 'POST') return json(res, 404, { error: 'unknown replica endpoint' });
  const fn = API[m[1]]?.[m[2]];
  if (!fn) return json(res, 404, { error: 'unknown replica action' });
  let body = {};
  try { body = JSON.parse((await readBody(req)) || '{}'); } catch { return json(res, 400, { error: 'bad json' }); }
  const [status, out] = fn(body);
  return json(res, status, out);
}
