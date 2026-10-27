import type { ProjectFile } from '../../ai/patches.js';
import { compileBrowserChecks } from '../../synthesis/webVerificationGate.js';
import { routesFromFiles } from '../readiness.js';
import type { BuildSpec } from '../types.js';
import type { QaCheck, QaPlan, QaStep } from './types.js';

/**
 * Derives a deterministic browser QA plan from the product specification and the actual source.
 *
 * Every check traces to something real: a route the project defines, an anchor or form present
 * in its markup, a requirement in the spec, or a compiled acceptance criterion. Nothing is
 * invented from a model's opinion of how the page "should" look. Requirements that need an
 * environment this slice cannot assume (a disposable database) are emitted as checks that say so.
 */

const MAX_CHECKS = 60;
const SAFE_ID = /[^a-z0-9]+/g;

const slug = (value: string) => value.toLowerCase().replace(SAFE_ID, '-').replace(/^-|-$/g, '').slice(0, 48) || 'x';
const cssAttr = (value: string) => value.replace(/["\\]/g, '');

const markup = (files: readonly ProjectFile[]) =>
  files.filter((file) => /\.(html|tsx|jsx)$/.test(file.path) && !file.path.startsWith('node_modules/'));

/** In-page anchors (#section). A link whose target is missing is still planned: that is the defect to catch. */
function anchorTargets(files: readonly ProjectFile[]): Array<{ href: string; id: string }> {
  const found: Array<{ href: string; id: string }> = [];
  for (const file of files.filter((candidate) => candidate.path.endsWith('.html'))) {
    for (const match of file.content.matchAll(/<a\b[^>]*\bhref=["']#([A-Za-z][\w-]*)["']/g)) {
      if (!found.some((entry) => entry.id === match[1])) found.push({ href: `#${match[1]}`, id: match[1] });
    }
  }
  return found.slice(0, 8);
}

/** Internal route links that resolve to a defined route. */
function internalLinks(files: readonly ProjectFile[], routes: readonly string[]): string[] {
  const links = new Set<string>();
  for (const file of markup(files)) {
    for (const match of file.content.matchAll(/\bhref=["'{`]*(\/[A-Za-z0-9/_-]*)["'}`]/g)) {
      if (match[1] !== '/' && routes.includes(match[1])) links.add(match[1]);
    }
  }
  return [...links].slice(0, 8);
}

interface FormInfo {
  readonly route: string;
  readonly hasRequired: boolean;
  readonly fields: ReadonlyArray<{ selector: string; value: string }>;
}

const SYNTHETIC: Record<string, string> = {
  email: 'qa.user@example.test',
  tel: '5550100',
  number: '3',
  url: 'https://example.test',
  password: 'QaPassw0rd!x',
  date: '2030-01-15',
  text: 'QA test entry',
};

/** Forms found in markup, with synthetic values for their inputs. Never uses real data. */
function formsIn(files: readonly ProjectFile[], routes: readonly string[]): FormInfo[] {
  const forms: FormInfo[] = [];
  for (const file of markup(files)) {
    const route = file.path.endsWith('.html') ? (file.path === 'index.html' ? '/' : `/${file.path}`) : routeOfComponent(file.path, routes);
    if (!route) continue;
    for (const block of file.content.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
      const fields: Array<{ selector: string; value: string }> = [];
      for (const input of block[0].matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
        const attrs = input[2];
        const type = /\btype=["']?([a-z]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? (input[1].toLowerCase() === 'textarea' ? 'text' : 'text');
        if (['submit', 'button', 'hidden', 'checkbox', 'radio', 'file'].includes(type) || input[1].toLowerCase() === 'select') continue;
        const name = /\bname=["']([\w-]+)["']/i.exec(attrs)?.[1];
        const id = /\bid=["']([\w-]+)["']/i.exec(attrs)?.[1];
        const selector = name ? `[name="${cssAttr(name)}"]` : id ? `#${id}` : null;
        if (!selector) continue;
        fields.push({ selector, value: SYNTHETIC[type] ?? SYNTHETIC.text });
      }
      if (fields.length) forms.push({ route, hasRequired: /\brequired\b/i.test(block[0]), fields });
    }
  }
  return forms.slice(0, 4);
}

function routeOfComponent(path: string, routes: readonly string[]): string | null {
  const match = /^(?:src\/)?app\/(.*?)\/?(?:page|[A-Za-z]+Form|[A-Za-z]+)\.(?:tsx|jsx)$/.exec(path);
  if (!match) return null;
  const segments = match[1].split('/').filter((segment) => segment && !(segment.startsWith('(') && segment.endsWith(')')));
  const route = `/${segments.join('/')}`;
  return routes.includes(route) ? route : null;
}

export function deriveQaPlan(spec: BuildSpec, files: readonly ProjectFile[]): QaPlan {
  const checks: QaCheck[] = [];
  const routes = routesFromFiles(files);
  const add = (check: QaCheck) => {
    if (checks.length < MAX_CHECKS && !checks.some((existing) => existing.id === check.id)) checks.push(check);
  };

  // Every defined route loads and renders a real heading on desktop.
  for (const route of routes) {
    add({
      id: `route-${slug(route)}-desktop`, title: `Page ${route} loads and renders a heading`, category: 'content', viewport: 'desktop', required: true,
      steps: [{ op: 'goto', path: route }, { op: 'expectVisible', selector: 'h1, h2' }], derivedFrom: `route ${route}`,
    });
  }

  // Responsive: the first routes on a phone-sized viewport must not overflow or lack a viewport meta.
  for (const route of routes.slice(0, 3)) {
    add({
      id: `responsive-${slug(route)}-mobile`, title: `Page ${route} fits a phone screen`, category: 'responsive', viewport: 'mobile', required: true,
      steps: [{ op: 'goto', path: route }, { op: 'expectViewportMeta' }, { op: 'expectNoHorizontalOverflow' }], derivedFrom: `route ${route} responsive`,
    });
  }

  // Navigation: in-page anchors reach their section; internal links reach their route.
  for (const target of anchorTargets(files)) {
    add({
      id: `nav-anchor-${slug(target.id)}`, title: `Link ${target.href} reaches its section`, category: 'navigation', viewport: 'desktop', required: true,
      steps: [{ op: 'goto', path: '/' }, { op: 'click', selector: `a[href="${cssAttr(target.href)}"]` }, { op: 'expectVisible', selector: `#${target.id}` }], derivedFrom: `anchor ${target.href}`,
    });
  }
  for (const link of internalLinks(files, routes)) {
    add({
      id: `nav-link-${slug(link)}`, title: `Link to ${link} navigates there`, category: 'navigation', viewport: 'desktop', required: true,
      steps: [{ op: 'goto', path: '/' }, { op: 'click', selector: `a[href="${cssAttr(link)}"]` }, { op: 'expectUrlPath', path: link }], derivedFrom: `link ${link}`,
    });
  }

  const wantsValidation = /validat/i.test(JSON.stringify([spec.objective, spec.acceptanceCriteria, spec.workflows]));
  // Forms: validation rejects an empty submit, and a valid submit gives the user feedback.
  for (const [index, form] of formsIn(files, routes).entries()) {
    const fill: QaStep[] = form.fields.map((field) => ({ op: 'fill', selector: field.selector, value: field.value }));
    // Validation is checked when the markup declares it OR the request asked for it (a form that
    // silently accepts anything is the defect the request names).
    if (form.hasRequired || wantsValidation) {
      add({
        id: `form-${index}-rejects-empty`, title: `Form on ${form.route} rejects an empty submission`, category: 'forms', viewport: 'desktop', required: true,
        steps: [{ op: 'goto', path: form.route }, { op: 'expectFormRejectsEmpty', selector: 'form' }], derivedFrom: `form on ${form.route}`,
      });
    }
    add({
      id: `form-${index}-feedback`, title: `Form on ${form.route} gives feedback after a valid submission`, category: 'forms', viewport: 'desktop', required: true,
      steps: [{ op: 'goto', path: form.route }, ...fill, { op: 'expectFeedbackAfter', selector: 'form' }], derivedFrom: `form on ${form.route}`,
    });
  }

  // Authentication: a sign-in page with credential fields; protected pages are not served anonymously.
  if (spec.technicalRequirements.requiresAuthentication) {
    if (routes.includes('/login')) {
      add({
        id: 'auth-login-fields', title: 'Sign-in page has email and password fields', category: 'auth', viewport: 'desktop', required: true,
        steps: [{ op: 'goto', path: '/login' }, { op: 'expectVisible', selector: 'input[type="email"], input[name="email"]' }, { op: 'expectVisible', selector: 'input[type="password"]' }], derivedFrom: 'requiresAuthentication',
      });
    }
    for (const protectedRoute of routes.filter((route) => /^\/(dashboard|admin|account|app|settings)(\/|$)/.test(route)).slice(0, 3)) {
      add({
        id: `auth-protected-${slug(protectedRoute)}`, title: `${protectedRoute} is not served to a signed-out visitor`, category: 'auth', viewport: 'desktop', required: true,
        steps: [{ op: 'expectProtected', path: protectedRoute }], derivedFrom: `protected route ${protectedRoute}`,
      });
    }
  }

  // Persistence needs a real database. It is planned, and reported pending where none is provided.
  if (spec.technicalRequirements.requiresDatabase) {
    add({
      id: 'persistence-survives-refresh', title: 'Saved data remains after a page refresh', category: 'persistence', viewport: 'desktop', required: true,
      steps: [], requires: 'database', derivedFrom: 'requiresDatabase',
    });
  }

  // Acceptance criteria with an unambiguous deterministic meaning.
  const compiled = compileBrowserChecks(spec.acceptanceCriteria);
  compiled.domExpectations.forEach((expectation, index) => {
    add({
      id: `criterion-dom-${index}`, title: expectation.description.slice(0, 140), category: 'criterion', viewport: 'desktop', required: true,
      steps: [{ op: 'goto', path: '/' }, expectation.selector ? { op: 'expectVisible', selector: expectation.selector } : { op: 'expectText', text: expectation.text ?? '' }], derivedFrom: 'acceptance criterion',
    });
  });
  compiled.interactions.forEach((interaction, index) => {
    add({
      id: `criterion-interaction-${index}`, title: interaction.description.slice(0, 140), category: 'criterion', viewport: 'desktop', required: true,
      steps: [{ op: 'goto', path: '/' }, { op: 'click', selector: interaction.clickSelector }, interaction.expectText ? { op: 'expectText', text: interaction.expectText } : { op: 'expectVisible', selector: interaction.expectSelector ?? 'body' }], derivedFrom: 'acceptance criterion',
    });
  });

  return {
    version: 1,
    checks,
    notChecked: compiled.notChecked.slice(0, 20).map((criterion) => ({ criterion, reason: 'No deterministic browser check can be derived from this criterion.' })),
  };
}
