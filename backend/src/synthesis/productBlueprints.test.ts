import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRODUCT_BLUEPRINTS,
  blueprintBriefForBuilder,
  describeBlueprintGaps,
  detectProductBlueprint,
  missingBlueprintSections,
} from './productBlueprints.js';

/**
 * Cover for the product-blueprint registry.
 *
 * The owner of this product identified the gap: *"our system I think not known their
 * capabilities what they build and what types of files are with what type of product,
 * because not all code file is same for all product building."*
 *
 * Run `85681d10` is the evidence — a dental clinic landing page that shipped with a
 * hero and nothing else. The architect planned five files, the builder delivered four,
 * and nothing anywhere stated what a booking page has to contain.
 */

const DENTAL_HERO_ONLY = [
  {
    path: 'index.html',
    content: `<!doctype html><html><head><meta name="description" content="Dental"><title>Lumina</title></head>
      <body><nav><a href="#x">Home</a></nav><h1>Your brightest smile starts here.</h1>
      <footer>© Lumina</footer></body></html>`,
  },
  { path: 'styles.css', content: '@media (max-width: 600px) { body { padding: 1rem } }' },
];

test('every product the owner named has a blueprint', () => {
  const wanted = ['website', 'landing_page', 'portfolio', 'booking_site', 'defi_dashboard', 'hackathon_project'];
  for (const id of wanted) {
    assert.ok(
      PRODUCT_BLUEPRINTS.some((blueprint) => blueprint.id === id),
      `no blueprint for ${id}`,
    );
  }
});

test('the prompts the owner asked about select the right blueprint', () => {
  const cases: Array<[string, string]> = [
    ['build a landing page of dental clinic', 'landing_page'],
    ['build a portfolio site with a dark theme', 'portfolio'],
    ['build a booking website for a barber shop', 'booking_site'],
    ['build a restaurant site where customers reserve a table', 'booking_site'],
    ['could you build crypto dashboard defi?', 'defi_dashboard'],
    ['build a crypto hackathon project', 'defi_dashboard'],
    ['build a website for my bakery', 'website'],
  ];
  for (const [prompt, expected] of cases) {
    assert.equal(detectProductBlueprint(prompt)?.id, expected, prompt);
  }
});

test('a specific product beats a generic one', () => {
  // "booking website for a dental clinic" matches booking, landing and website. The
  // narrowest reading is the useful one.
  assert.equal(detectProductBlueprint('build a booking website for a dental clinic')?.id, 'booking_site');
  assert.equal(detectProductBlueprint('build a defi staking website')?.id, 'defi_dashboard');
});

test('negative constraints do not select the product they explicitly exclude', () => {
  const prompt =
    'Build a static one-page marketing website for a coffee shop. This is not ecommerce: no cart, checkout, ordering, accounts, payments, or backend.';
  assert.notEqual(detectProductBlueprint(prompt)?.id, 'ecommerce');
  assert.equal(detectProductBlueprint(prompt)?.id, 'website');
  assert.equal(detectProductBlueprint('Build an online shop with a cart and checkout')?.id, 'ecommerce');
});

test('a non-web product selects no blueprint', () => {
  // Chrome extensions, CLIs and mobile apps reach the same code. Demanding a <nav> of
  // them would produce gap reports that are simply wrong.
  for (const prompt of ['build a CLI tool that renames files', 'write a python script to parse logs']) {
    assert.equal(detectProductBlueprint(prompt), null, prompt);
  }
});

test('an empty prompt selects nothing rather than defaulting', () => {
  assert.equal(detectProductBlueprint(''), null);
  assert.equal(detectProductBlueprint('   '), null);
});

test('reproduces the run: a hero-only page is reported as incomplete', () => {
  const blueprint = detectProductBlueprint('build a landing page of dental clinic')!;
  const gaps = missingBlueprintSections(blueprint, DENTAL_HERO_ONLY);
  assert.ok(gaps.length >= 3, `expected several gaps, got ${gaps.map((g) => g.sectionId).join(', ')}`);
  assert.ok(gaps.some((gap) => gap.sectionId === 'value_props'));
});

test('a complete page reports no gaps', () => {
  const blueprint = detectProductBlueprint('build a landing page for a dental clinic')!;
  const complete = [
    {
      path: 'index.html',
      content: `<!doctype html><html><head><meta name="description" content="Dental clinic">
        <title>Lumina</title></head><body>
        <nav><a href="#services">Services</a></nav>
        <h1>Your brightest smile</h1>
        <section id="services"><h2>Our features and benefits</h2></section>
        <section><h2>Testimonials</h2><p>Trusted by 2,000+ patients</p></section>
        <section><a href="#book">Book an appointment</a></section>
        <footer>© Lumina</footer></body></html>`,
    },
    { path: 'styles.css', content: '@media (min-width: 768px) { .grid { display: grid } }' },
  ];
  assert.deepEqual(missingBlueprintSections(blueprint, complete), []);
});

test('recommended sections are briefed but never reported as gaps', () => {
  // Otherwise every build would report an "FAQ missing" gap and the report becomes
  // noise nobody reads.
  for (const blueprint of PRODUCT_BLUEPRINTS) {
    const gaps = missingBlueprintSections(blueprint, [{ path: 'index.html', content: '' }]);
    const recommended = new Set(
      blueprint.sections.filter((s) => s.priority === 'recommended').map((s) => s.id),
    );
    for (const gap of gaps) assert.ok(!recommended.has(gap.sectionId), `${blueprint.id}/${gap.sectionId}`);
  }
});

test('evidence is searched across every source file, not just the html', () => {
  // A section can legitimately live in a component or a stylesheet.
  const blueprint = detectProductBlueprint('build a portfolio site')!;
  const split = [
    { path: 'index.html', content: '<html><head><meta name="description" content="x"><title>t</title></head><body><nav></nav><h1>Hi</h1><footer>f</footer></body></html>' },
    { path: 'components/About.tsx', content: 'export const About = () => <section>About me — a short bio</section>;' },
    { path: 'components/Projects.tsx', content: 'export const Projects = () => <section>Project one</section>;' },
    { path: 'components/Skills.tsx', content: 'const skills = ["TypeScript"]; // tech stack' },
    { path: 'components/Contact.tsx', content: '<a href="mailto:me@example.com">Contact</a>' },
    { path: 'styles.css', content: '@media (max-width: 640px) { :root { font-size: 15px } }' },
  ];
  assert.deepEqual(missingBlueprintSections(blueprint, split), []);
});

test('a lockfile cannot accidentally satisfy a requirement', () => {
  const blueprint = detectProductBlueprint('build a booking website')!;
  const gaps = missingBlueprintSections(blueprint, [
    { path: 'index.html', content: '<html><body><h1>Book</h1></body></html>' },
    { path: 'package-lock.json', content: JSON.stringify({ packages: { 'node_modules/calendar': {} } }) },
  ]);
  assert.ok(gaps.some((gap) => gap.sectionId === 'availability'));
});

test('no files at all produces no gaps — that failure is reported elsewhere', () => {
  const blueprint = detectProductBlueprint('build a landing page')!;
  assert.deepEqual(missingBlueprintSections(blueprint, []), []);
});

test('the builder brief states requirements, not suggestions', () => {
  const blueprint = detectProductBlueprint('build a booking website')!;
  const brief = blueprintBriefForBuilder(blueprint);
  assert.match(brief, /not complete until/i);
  assert.match(brief, /Do not stop early/i);
  assert.match(brief, /booking form/i);
  assert.match(brief, /double-book/i);
});

test('every blueprint produces a usable brief', () => {
  for (const blueprint of PRODUCT_BLUEPRINTS) {
    const brief = blueprintBriefForBuilder(blueprint);
    assert.match(brief, new RegExp(blueprint.label.replace(/[/]/g, '.')), blueprint.id);
    assert.ok(brief.length > 200, blueprint.id);
  }
});

test('the DeFi blueprint forbids handling private keys', () => {
  // A crypto dashboard that asks for a seed phrase is the one outcome that must never
  // be generated, so it is stated in the brief rather than left to the model.
  const brief = blueprintBriefForBuilder(detectProductBlueprint('build a defi dashboard')!);
  assert.match(brief, /never ask for, store, or transmit a private key or seed phrase/i);
});

test('the booking blueprint requires persistence, not just a form', () => {
  const brief = blueprintBriefForBuilder(detectProductBlueprint('build a booking site')!);
  assert.match(brief, /survives a page reload/i);
});

test('the gap description names the sections so it is actionable', () => {
  const blueprint = detectProductBlueprint('build a landing page')!;
  const gaps = missingBlueprintSections(blueprint, DENTAL_HERO_ONLY);
  const description = describeBlueprintGaps(blueprint, gaps);
  assert.match(description, /Landing page/);
  for (const gap of gaps) {
    assert.ok(description.includes(gap.sectionId.replace(/_/g, ' ')), gap.sectionId);
  }
});

test('no gaps produces no description', () => {
  const blueprint = detectProductBlueprint('build a landing page')!;
  assert.equal(describeBlueprintGaps(blueprint, []), '');
});

test('every required section has evidence that its own requirement text would not fake', () => {
  // Guards a subtle authoring mistake: an evidence pattern so broad that it matches any
  // page would make the section unfalsifiable and the check worthless.
  const trivial = [{ path: 'index.html', content: '<html><body></body></html>' }];
  for (const blueprint of PRODUCT_BLUEPRINTS) {
    const required = blueprint.sections.filter((s) => s.priority === 'required');
    const gaps = missingBlueprintSections(blueprint, trivial);
    assert.ok(
      gaps.length >= required.length - 1,
      `${blueprint.id}: only ${gaps.length} of ${required.length} sections are detectable as missing`,
    );
  }
});
