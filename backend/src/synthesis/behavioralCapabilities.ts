/**
 * What the product must *do*, and what that requires technically.
 *
 * `inferSurfaces` matches surface nouns — "website", "CLI", "API", "extension". That works
 * when the request names its own shape, and fails completely when it describes behaviour
 * instead. Three real requests produced nothing:
 *
 *   "customers reserve a time slot and staff manage availability"  → refused_no_surface
 *   "product catalogue, a cart, checkout and order history"        → refused_no_surface
 *   "teams sign in, view usage charts and invite members"          → web_frontend only
 *
 * None of those sentences contains a surface noun. The first two were refused outright; the
 * third got the visual surface and no backend, so the planned product had nowhere to keep a
 * team or check a password.
 *
 * The fix is not a booking branch, a commerce branch and a SaaS branch — that would move the
 * boundary rather than remove it, and the fourth unfamiliar product would fail exactly the
 * same way. This asks a different question first:
 *
 *   **what capabilities does this behaviour require?**
 *
 * "Reserve a slot" needs durable state and a rule that stops two people taking the same one.
 * "Invite a member" needs identity and a record of who belongs to what. "Add to cart, place
 * an order" needs state that survives a page load and a server that owns the transition.
 * None of that reasoning mentions booking, commerce or SaaS, which is the point: a request
 * for a locker-rental system or a clinical trial scheduler gets the same treatment without
 * anyone adding a rule for it.
 *
 * The output feeds the existing surface scoring as additional weighted evidence. It does not
 * replace `RULES` and does not introduce a second surface vocabulary.
 *
 * ## Not over-correcting
 *
 * The opposite failure is just as bad: turning every request into frontend + backend +
 * database + auth. A static portfolio has no persistence behaviour, so it implies no service.
 * A Rust CLI that writes a config file has persistence, but no *shared* state and no browser
 * client, so it stays a CLI. Every implication below therefore requires a combination, not a
 * single keyword — and the combinations are stated as rules that can be read and argued with.
 */

/** A technical capability a product needs. Derived from behaviour, never from a label. */
export type ProductCapability =
  | 'user_interface'
  | 'persistence'
  | 'shared_state'
  | 'authentication'
  | 'authorization'
  | 'business_rules'
  | 'conflict_control'
  | 'scheduling'
  | 'realtime'
  | 'file_storage'
  | 'notification'
  | 'payment'
  | 'external_integration'
  | 'search_retrieval';

export interface BehaviourSignal {
  readonly capability: ProductCapability;
  /** What the request said, quoted, so a plan can cite the words rather than assert. */
  readonly evidence: string;
  /** Why that phrase implies the capability, in terms of what the software must do. */
  readonly because: string;
  readonly weight: number;
}

interface BehaviourRule {
  readonly capability: ProductCapability;
  readonly pattern: RegExp;
  readonly weight: number;
  readonly because: string;
}

/**
 * Behaviour patterns.
 *
 * Every pattern describes something a *user or system does*, never a product category. There
 * is deliberately no rule matching "booking", "e-commerce" or "SaaS": those are labels, and
 * matching them would rebuild the catalogue this replaces. A request that says "booking
 * system" and nothing else should be under-specified, and it is — it is the verbs that carry
 * the requirements.
 */
const BEHAVIOUR_RULES: readonly BehaviourRule[] = [
  // ── People using it through a screen ──────────────────────────────────────────
  {
    capability: 'user_interface',
    pattern: /\b(users?|customers?|visitors?|staff|admins?|members?|teams?|people)\b[\s\S]{0,60}\b(can|may|able to|view|see|browse|manage|create|book|order)\b/i,
    weight: 7,
    because: 'named people interact with the product, so something must present it to them',
  },
  {
    capability: 'user_interface',
    pattern: /\b(dashboard|page|screen|interface|form|portal|storefront|catalogue|catalog)\b/i,
    weight: 6,
    because: 'the request names something rendered for a person to look at',
  },

  // ── State that outlives the request ───────────────────────────────────────────
  {
    capability: 'persistence',
    pattern: /\b(save|saved|store[ds]?|storing|persist(?:ed|ence)?|record(?:s|ed)?|history|database|db|postgres|sqlite|mysql|mongo)\b/i,
    weight: 8,
    because: 'the product must remember something after the request that created it ends',
  },
  {
    capability: 'persistence',
    pattern: /\b(create|add|update|edit|delete|remove|cancel)\b[\s\S]{0,40}\b(record|entry|item|product|order|reservation|booking|account|project|post|task|user)s?\b/i,
    weight: 8,
    because: 'entities are created and later changed, which requires durable storage',
  },
  {
    capability: 'persistence',
    pattern: /\b(cart|basket|order|reservation|booking|appointment|subscription|invoice)s?\b/i,
    weight: 7,
    because: 'the request names domain state that must survive between interactions',
  },

  // ── State shared between people ───────────────────────────────────────────────
  {
    capability: 'shared_state',
    pattern: /\b(teams?|members?|organisations?|organizations?|tenants?|workspaces?|multi[- ]?user|collaborat|shared)\b/i,
    weight: 8,
    because: 'more than one person sees or changes the same state, so it cannot live on one device',
  },
  {
    capability: 'shared_state',
    pattern: /\b(customers?|clients?|visitors?)\b[\s\S]{0,40}\b(and|while|whereas)\b[\s\S]{0,40}\b(admins?|staff|managers?|owners?)\b/i,
    weight: 8,
    because: 'two different audiences act on the same data, which makes the state shared',
  },
  {
    capability: 'shared_state',
    pattern: /\b(available|availability|inventory|stock|slots?|capacity|seats?)\b/i,
    weight: 7,
    because: 'a supply that several people draw from is shared state by definition',
  },

  // ── Knowing who someone is ────────────────────────────────────────────────────
  {
    capability: 'authentication',
    pattern: /\b(sign[- ]?in|sign[- ]?up|log[- ]?in|login|authenticat|password|session|account creation|register)\b/i,
    weight: 9,
    because: 'the product must establish who a request is coming from',
  },

  // ── What that someone is allowed to do ────────────────────────────────────────
  {
    capability: 'authorization',
    pattern: /\b(admin(?:s|istrator)?s?|permission|role|owner(?:ship)?|only .{0,20}(?:can|may)|restrict|private to)\b/i,
    weight: 8,
    because: 'different people are allowed different actions, which must be enforced somewhere trusted',
  },
  {
    capability: 'authorization',
    pattern: /\b(invite|invitation|membership|join(?:s|ing)? (?:a )?(?:team|workspace|organisation|organization))\b/i,
    weight: 8,
    because: 'membership decides access, so who belongs to what must be recorded and checked',
  },

  // ── Rules the client cannot be trusted to apply ───────────────────────────────
  {
    capability: 'business_rules',
    pattern: /\b(validate|validation|rules?|workflow|approve|approval|status|state machine|process(?:es|ing)?)\b/i,
    weight: 6,
    because: 'the product enforces conditions rather than only displaying data',
  },
  {
    capability: 'conflict_control',
    pattern: /\b(double[- ]?book|conflict|overlap|already (?:taken|reserved|booked)|concurren|race|out of stock|sold out)\b/i,
    weight: 9,
    because: 'two simultaneous attempts must not both succeed, which requires a single arbiter',
  },
  {
    capability: 'conflict_control',
    pattern: /\b(reserve|reserving|book(?:ing)? a|claim|check ?out|place (?:an )?order)\b/i,
    weight: 7,
    because: 'taking a finite thing must be settled atomically or two people get the same one',
  },

  // ── Time-driven work ──────────────────────────────────────────────────────────
  {
    capability: 'scheduling',
    pattern: /\b(cron|scheduled?|periodic(?:ally)?|every (?:hour|day|night|week|minute)|reminder|nightly|daily)\b/i,
    weight: 8,
    because: 'work is triggered by the clock rather than by a caller',
  },

  // ── Push rather than poll ─────────────────────────────────────────────────────
  {
    capability: 'realtime',
    pattern: /\b(real[- ]?time|live (?:updates?|feed)|websocket|push (?:notification)?|chat|presence|collaborative editing)\b/i,
    weight: 8,
    because: 'changes must reach a client without it asking, which needs a persistent transport',
  },

  // ── Bytes that are not rows ───────────────────────────────────────────────────
  {
    capability: 'file_storage',
    pattern: /\b(upload|attachment|image|photo|video|document|file)s?\b[\s\S]{0,30}\b(upload|store|save|attach)\b/i,
    weight: 8,
    because: 'binary content needs storage a database row is the wrong shape for',
  },
  {
    capability: 'file_storage',
    pattern: /\b(upload(?:s|ing|ed)?)\b/i,
    weight: 6,
    because: 'the product receives files from users',
  },

  // ── Reaching a person outside the app ─────────────────────────────────────────
  {
    capability: 'notification',
    pattern: /\b(email|e-mail|sms|notif(?:y|ication)|alert|send a message|confirmation email)\b/i,
    weight: 7,
    because: 'the product must reach a person through a channel it does not own',
  },

  // ── Money ─────────────────────────────────────────────────────────────────────
  // Deliberately narrow. "Order" and "checkout" appear constantly in products that never
  // take a card, and inventing a payment integration is a real cost and a real compliance
  // surface. Only an explicit mention of paying counts.
  {
    capability: 'payment',
    pattern: /\b(payment|pay(?:ing|ments?)? (?:with|by|for)|stripe|paypal|credit card|billing|charge the customer|subscription billing)\b/i,
    weight: 9,
    because: 'money changes hands, which requires a payment provider and its verification rules',
  },

  // ── Somebody else's system ────────────────────────────────────────────────────
  {
    capability: 'external_integration',
    pattern: /\b(integrat(?:e|ion)|third[- ]party|external (?:api|service)|webhook|oauth|slack|github|google calendar)\b/i,
    weight: 7,
    because: 'the product depends on a system it does not control',
  },

  // ── Finding things ────────────────────────────────────────────────────────────
  {
    capability: 'search_retrieval',
    pattern: /\b(search|filter|query|full[- ]text|semantic search|rag|embedding|vector)\b/i,
    weight: 6,
    because: 'users locate records rather than reading all of them',
  },
];

/**
 * Capabilities the request's behaviour requires.
 *
 * Signals are merged per capability and the strongest evidence is kept, so a request that
 * says "sign in" three different ways does not out-vote one that says it once and also needs
 * a database.
 */
export function inferBehaviouralCapabilities(prompt: string): readonly BehaviourSignal[] {
  const best = new Map<ProductCapability, BehaviourSignal>();

  for (const rule of BEHAVIOUR_RULES) {
    const match = prompt.match(rule.pattern);
    if (!match) continue;
    const signal: BehaviourSignal = {
      capability: rule.capability,
      evidence: `request says "${match[0].trim()}"`,
      because: rule.because,
      weight: rule.weight,
    };
    const existing = best.get(rule.capability);
    if (!existing || signal.weight > existing.weight) best.set(rule.capability, signal);
  }

  return [...best.values()].sort((a, b) => b.weight - a.weight);
}

export interface SurfaceImplication {
  readonly surface: string;
  readonly weight: number;
  readonly reason: string;
  readonly evidence: readonly string[];
}

const has = (capabilities: ReadonlySet<ProductCapability>, ...wanted: ProductCapability[]) =>
  wanted.every((capability) => capabilities.has(capability));

const any = (capabilities: ReadonlySet<ProductCapability>, ...wanted: ProductCapability[]) =>
  wanted.some((capability) => capabilities.has(capability));

/**
 * Surfaces the required capabilities imply.
 *
 * Every implication needs a *combination*, never a single capability. That is what keeps a
 * CLI a CLI: writing a config file is persistence, but persistence alone implies nothing,
 * because a local tool storing local state needs no service. It is persistence plus shared
 * state — or plus a browser client, or plus enforced rules — that requires a server.
 *
 * `clientSurfaces` is passed in so a mobile or desktop or extension request does not also
 * acquire a web front end. The behaviour "a person uses this" is real in all of those cases;
 * which client renders it is decided by the surface rules, and only when they decided nothing
 * does a browser become the default assumption.
 */
export function surfacesImpliedByCapabilities(
  signals: readonly BehaviourSignal[],
  clientSurfaces: readonly string[] = [],
): readonly SurfaceImplication[] {
  const capabilities = new Set(signals.map((signal) => signal.capability));
  if (!capabilities.size) return [];

  const cite = (...wanted: ProductCapability[]) =>
    signals.filter((signal) => wanted.includes(signal.capability)).map((signal) => signal.evidence);

  const implications: SurfaceImplication[] = [];

  // A person uses this, and no other client surface was recognised. Only then is a browser
  // the reasonable assumption — a mobile app request must not also become a website.
  const hasClient = clientSurfaces.some((surface) =>
    ['web_frontend', 'mobile_app', 'desktop_app', 'browser_extension', 'cli', 'game'].includes(surface),
  );
  if (capabilities.has('user_interface') && !hasClient) {
    implications.push({
      surface: 'web_frontend',
      weight: 7,
      reason: 'people interact with this product and no other client surface was named',
      evidence: cite('user_interface'),
    });
  }

  // Durable state that more than one person touches, or that a browser client reads, cannot
  // live in the client. Something server-side must own it.
  //
  // `shared_state` with a client is sufficient on its own, and finding that out was the
  // point of testing unfamiliar products: "members borrow equipment and librarians manage
  // who may borrow" describes state several people act on, but names none of the storage
  // verbs the persistence rules look for. Requiring an explicit persistence phrase meant the
  // rule generalised to products that happened to use the vocabulary and no further. State
  // that several people share cannot live in one client — that is true regardless of which
  // words the request used to describe it.
  const needsService =
    (has(capabilities, 'persistence', 'shared_state') ||
      has(capabilities, 'shared_state', 'user_interface') ||
      (capabilities.has('persistence') && capabilities.has('user_interface')) ||
      any(capabilities, 'authentication', 'authorization', 'conflict_control', 'payment')) &&
    // A CLI or library with local persistence is not a service. The presence of a non-client
    // local surface is what distinguishes "stores a config file" from "stores our bookings".
    !(clientSurfaces.includes('cli') && !capabilities.has('shared_state'));

  if (needsService) {
    implications.push({
      surface: 'api',
      weight: 9,
      reason:
        'state is shared, or rules must be enforced where a client cannot be trusted to enforce them',
      evidence: cite('persistence', 'shared_state', 'authentication', 'authorization', 'conflict_control'),
    });
  }

  if (capabilities.has('scheduling')) {
    implications.push({
      surface: 'scheduled_job',
      weight: 8,
      reason: 'work is triggered by the clock rather than by a request',
      evidence: cite('scheduling'),
    });
  }

  if (capabilities.has('realtime')) {
    implications.push({
      surface: 'realtime_service',
      weight: 7,
      reason: 'clients are pushed changes rather than polling for them',
      evidence: cite('realtime'),
    });
  }

  if (capabilities.has('notification') && !capabilities.has('scheduling')) {
    implications.push({
      surface: 'worker',
      weight: 5,
      reason: 'reaching an external channel should not block the request that triggered it',
      evidence: cite('notification'),
    });
  }

  return implications;
}
