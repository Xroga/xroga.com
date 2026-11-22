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
    db: {
      updates: 0, refused: 0, log: [],
      tickets: [
        { id: 1, title: 'Billing address change', status: 'open', tenant: 'acme' },
        { id: 2, title: 'Renewal', status: 'open', tenant: 'acme' },
        { id: 3, title: 'Login problem', status: 'open', tenant: 'acme' },
        { id: 4, title: 'Renewal', status: 'open', tenant: 'acme' },
        { id: 5, title: 'Renewal', status: 'open', tenant: 'globex' },
        { id: 6, title: 'Invoice question', status: 'open', tenant: 'acme' },
        { id: 7, title: 'Renewal', status: 'open', tenant: 'acme' },
        { id: 8, title: 'Export request', status: 'closed', tenant: 'acme' },
      ],
    },
    docs: {
      created: [], log: [],
      items: [
        { id: 'd1', title: 'Vendor Security Review 2026: Scope', owner: 'ops', modified: '2026-03-02', body: 'The 2026 vendor security review covers eleven suppliers. Only suppliers that process customer data are in scope.' },
        { id: 'd2', title: 'Vendor Security Review 2026: Findings', owner: 'ops', modified: '2026-04-18', body: 'Three suppliers failed the encryption-at-rest requirement. Remediation plans are due within sixty days.' },
        { id: 'd3', title: 'Vendor Security Review 2026: Interview Notes', owner: 'sec', modified: '2026-05-07', body: 'Supplier staff could not name an incident contact in four of eleven interviews. This is an organisational risk.' },
        { id: 'd4', title: 'Vendor Security Review 2026: Remediation Tracker', owner: 'ops', modified: '2026-06-21', body: 'Two of the three failing suppliers have shipped encryption fixes. One is still open and escalated.' },
        { id: 'd5', title: 'Vendor Security Review 2026: Sign-off', owner: 'cfo', modified: '2026-07-30', body: 'The review was signed off on the condition that the open supplier is re-audited before the renewal date.' },
        { id: 'd6', title: 'Office Move Checklist', owner: 'facilities', modified: '2026-05-11', body: 'Boxes must be labelled by team. The security badge desk closes at noon on moving day.' },
        { id: 'd7', title: 'Vendor Security Review 2025: Findings', owner: 'ops', modified: '2025-04-02', body: 'In 2025 two suppliers failed the access-control requirement.' },
        { id: 'd8', title: 'Brand Guidelines', owner: 'marketing', modified: '2026-01-15', body: 'Use the primary logo on a white background.' },
      ],
    },
    mail: { drafts: [], sent: 0, discarded: 0, saves: 0, log: [] },
    cal: {
      drafts: [], sent: 0, log: [],
      people: {
        lisbon: { name: 'Ana (Lisbon, UTC+0)', hours: '09:00-17:00 local', busy: ['2026-12-07 14:00-15:00', '2026-12-09 09:00-12:00'] },
        karachi: { name: 'Bilal (Karachi, UTC+5)', hours: '09:00-17:00 local', busy: ['2026-12-08 20:00-21:00', '2026-12-07 14:00-16:00'] },
      },
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
  db: {
    list: () => [200, state.db.tickets],
    update(b) {
      const t = state.db.tickets.find(x => x.id === Number(b.id));
      if (!t) return [404, { error: 'not found' }];
      if (t.tenant !== 'acme') { state.db.refused++; state.db.log.push({ id: t.id, refused: true }); return [403, { error: 'row-level security: this row belongs to another tenant' }]; }
      t.status = String(b.status); state.db.updates++; state.db.log.push({ id: t.id, status: t.status });
      return [200, { ok: true, ticket: t }];
    },
  },
  docs: {
    // A document the person created appears in the drive like any other (owner "You", modified today); the grader still reads `created`.
    list: b => { const q = String(b.q ?? '').toLowerCase(); return [200, [...state.docs.items, ...state.docs.created.map(d => ({ ...d, owner: 'You', modified: new Date().toISOString().slice(0, 10) }))].filter(d => !q || (d.title + ' ' + d.body).toLowerCase().includes(q)).map(d => ({ id: d.id, title: d.title, owner: d.owner, modified: d.modified }))]; },
    get: b => { const d = state.docs.items.find(x => x.id === b.id) ?? state.docs.created.find(x => x.id === b.id); return d ? [200, { owner: 'You', modified: new Date().toISOString().slice(0, 10), ...d }] : [404, { error: 'not found' }]; },
    create(b) {
      const title = String(b.title ?? '').trim(), body = String(b.body ?? '');
      if (!title) return [422, { error: 'title required' }];
      const d = { id: 'n' + (state.docs.created.length + 1), title, body };
      state.docs.created.push(d); return [200, { ok: true, doc: d }];
    },
  },
  // A webmail: saving squeezes paragraph breaks unless keepSpacing is set (a quirk of the app), and the same recipient and subject saved twice makes two drafts.
  mail: {
    list: () => [200, state.mail.drafts.map(d => ({ id: d.id, to: d.to, subject: d.subject, body: d.body }))],
    get(b) { const d = state.mail.drafts.find(x => x.id === b.id); return d ? [200, d] : [404, { error: 'not found' }]; },
    save(b) {
      const to = String(b.to ?? '').trim(), subject = String(b.subject ?? '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return [422, { error: 'a valid recipient is needed' }];
      if (!subject) return [422, { error: 'a subject is needed' }];
      let body = String(b.body ?? '');
      if (!b.keepSpacing) body = body.replace(/\n{2,}/g, '\n');
      let d = b.id ? state.mail.drafts.find(x => x.id === b.id) : null;
      if (d) Object.assign(d, { to, subject, body });
      else { d = { id: 'm' + (state.mail.saves + 1), to, subject, body }; state.mail.drafts.push(d); }
      state.mail.saves++; state.mail.log.push({ id: d.id, to });
      return [200, { ok: true, draft: d }];
    },
    send() { state.mail.sent++; return [200, { ok: true }]; },
    discard(b) { const n = state.mail.drafts.length; state.mail.drafts = state.mail.drafts.filter(x => x.id !== b.id); state.mail.discarded += n - state.mail.drafts.length; return [200, { ok: true }]; },
  },
  cal: {
    people: () => [200, state.cal.people],
    draft(b) { state.cal.drafts.push({ to: String(b.to ?? ''), subject: String(b.subject ?? ''), body: String(b.body ?? '') }); return [200, { ok: true }]; },
    send() { state.cal.sent++; return [200, { ok: true }]; },
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
