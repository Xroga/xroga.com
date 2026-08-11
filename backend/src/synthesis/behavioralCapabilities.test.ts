import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferBehaviouralCapabilities,
  surfacesImpliedByCapabilities,
  type ProductCapability,
} from './behavioralCapabilities.js';
import { planUniversalRun } from './universalFlow.js';

/**
 * Behaviour-driven product understanding.
 *
 * The gap this closes: `inferSurfaces` matched surface nouns, so a request describing what
 * people *do* rather than what the product *is* matched nothing. Booking and commerce were
 * refused outright; SaaS got a front end with no backend.
 *
 * The tests worth writing are not "booking now works" — that would pass just as well with a
 * booking branch, which is the thing being avoided. They are:
 *
 *   - the same reasoning generalises to products nobody wrote a rule for;
 *   - it does not over-correct familiar products into full stacks;
 *   - it does not invent capabilities the request never asked for.
 */

const capabilitiesOf = (prompt: string): ProductCapability[] =>
  inferBehaviouralCapabilities(prompt).map((signal) => signal.capability);

const surfacesOf = (prompt: string) =>
  planUniversalRun({ prompt }).spec.surfaces.map((declaration) => String(declaration.surface));

describe('behaviour implies capability, never a product label', () => {
  it('no rule matches a product category name', () => {
    // The property that keeps this from becoming the catalogue it replaces. A bare label
    // with no verbs is under-specified, and must stay that way.
    for (const label of ['Build a booking system', 'Build an e-commerce site', 'Build a SaaS']) {
      const capabilities = capabilitiesOf(label);
      assert.equal(
        capabilities.includes('conflict_control'),
        false,
        `"${label}" inferred domain capabilities from the label alone: ${capabilities.join(', ')}`,
      );
    }
  });

  it('sign-in implies authentication', () => {
    assert.ok(capabilitiesOf('users sign in with a password').includes('authentication'));
  });

  it('membership implies authorization', () => {
    assert.ok(capabilitiesOf('invite members to a team').includes('authorization'));
  });

  it('taking a finite thing implies conflict control', () => {
    assert.ok(capabilitiesOf('customers reserve a time slot').includes('conflict_control'));
    assert.ok(capabilitiesOf('customers place an order').includes('conflict_control'));
  });

  it('two audiences acting on the same data implies shared state', () => {
    assert.ok(
      capabilitiesOf('customers reserve a slot while admins manage availability').includes('shared_state'),
    );
  });
});

describe('generalisation — products nobody wrote a rule for', () => {
  /**
   * None of these are booking, commerce or SaaS, and none has a rule naming it. Each should
   * still acquire a service, because each describes shared durable state with rules.
   */
  const unfamiliar: Array<[string, string]> = [
    ['locker rental', 'Build a locker rental system where students claim an available locker for a term and staff manage which lockers exist'],
    ['clinical scheduler', 'Build a clinical trial scheduler where coordinators assign participants to available visit windows and prevent double-booking'],
    ['equipment loans', 'Build a tool library where members borrow equipment, return it, and librarians manage the catalogue and who may borrow'],
    ['allotments', 'Build an allotment plot register where residents apply for a vacant plot and the council approves or rejects applications'],
    ['study rooms', 'Build a study room reservation tool where students book a room for an hour and cannot book one already taken'],
  ];

  for (const [label, prompt] of unfamiliar) {
    it(`${label} infers a service without a rule naming it`, () => {
      const found = surfacesOf(prompt);
      assert.ok(found.includes('api'), `${label} planned no service: ${found.join(', ')}`);
      assert.notDeepEqual(found, [], `${label} was refused`);
    });
  }

  it('an unfamiliar product is never planned as a website alone', () => {
    for (const [label, prompt] of unfamiliar) {
      const found = surfacesOf(prompt);
      assert.notDeepEqual(found, ['web_frontend'], `${label} collapsed to a website`);
    }
  });
});

describe('not over-correcting — the opposite failure', () => {
  it('a static portfolio stays a front end', () => {
    // No persistence, no shared state, no rules. Adding a backend here would be the mirror
    // of the bug being fixed.
    const found = surfacesOf('Build a static portfolio website showing my projects and a contact section');
    assert.deepEqual(found, ['web_frontend'], `surfaces: ${found.join(', ')}`);
  });

  it('a CLI that stores local state stays a CLI', () => {
    // Persistence alone implies nothing. A local tool writing a config file needs no service,
    // and this is the case that would break first if the implication rules were loosened.
    const found = surfacesOf('Build a Rust CLI that converts CSV files to JSON and saves its settings to a config file');
    assert.ok(found.includes('cli'), `surfaces: ${found.join(', ')}`);
    assert.equal(found.includes('api'), false, `a local CLI acquired a service: ${found.join(', ')}`);
  });

  it('a library stays a library', () => {
    const found = surfacesOf('Build a Python library for parsing ISO 8601 durations, published to PyPI');
    assert.equal(found.includes('api'), false, `surfaces: ${found.join(', ')}`);
    assert.equal(found.includes('web_frontend'), false, `surfaces: ${found.join(', ')}`);
  });

  it('a mobile request does not also become a website', () => {
    // The implication that a person uses this is real; which client renders it is decided by
    // the surface rules. Only when they decided nothing does a browser become the assumption.
    const found = surfacesOf('Build a mobile app where customers reserve a table and see their reservations');
    assert.ok(found.includes('mobile_app'), `surfaces: ${found.join(', ')}`);
    assert.equal(found.includes('web_frontend'), false, `a mobile request acquired a website: ${found.join(', ')}`);
  });

  it('a backend-only request does not acquire a UI', () => {
    const found = surfacesOf('Build a stateless webhook proxy that forwards inbound requests to another URL');
    assert.equal(found.includes('web_frontend'), false, `surfaces: ${found.join(', ')}`);
  });
});

describe('capabilities are not invented', () => {
  it('payment requires an explicit mention of paying', () => {
    const ordering = capabilitiesOf('customers add items to a cart and place an order');
    assert.equal(ordering.includes('payment'), false, `payment invented: ${ordering.join(', ')}`);
    assert.ok(capabilitiesOf('customers pay by credit card at checkout').includes('payment'));
  });

  it('realtime requires an explicit mention of live behaviour', () => {
    const booking = capabilitiesOf('customers reserve a slot and admins manage availability');
    assert.equal(booking.includes('realtime'), false, `realtime invented: ${booking.join(', ')}`);
    assert.ok(capabilitiesOf('team members see live updates as others edit').includes('realtime'));
  });

  it('file storage requires an upload, not merely a mention of images', () => {
    assert.ok(capabilitiesOf('users upload a profile photo').includes('file_storage'));
    assert.equal(
      capabilitiesOf('the landing page shows a hero image').includes('file_storage'),
      false,
      'a decorative image implied storage',
    );
  });
});

describe('implication rules', () => {
  it('an empty behaviour set implies nothing', () => {
    assert.deepEqual(surfacesImpliedByCapabilities([]), []);
  });

  it('scheduling implies a scheduled job', () => {
    const implied = surfacesImpliedByCapabilities(
      inferBehaviouralCapabilities('send a reminder email every day to users with an upcoming reservation'),
    ).map((implication) => implication.surface);
    assert.ok(implied.includes('scheduled_job'), `implied: ${implied.join(', ')}`);
  });

  it('every implication cites the words that produced it', () => {
    // A plan that asserts a backend without being able to say which phrase required it is
    // exactly the unevidenced reasoning the surface system exists to avoid.
    const implications = surfacesImpliedByCapabilities(
      inferBehaviouralCapabilities('users sign in, create teams and invite members'),
    );
    assert.ok(implications.length > 0);
    for (const implication of implications) {
      assert.ok(implication.reason.length > 0, `${implication.surface} has no reason`);
      assert.ok(implication.evidence.length > 0, `${implication.surface} cites no evidence`);
      for (const evidence of implication.evidence) assert.match(evidence, /request says/);
    }
  });
});
