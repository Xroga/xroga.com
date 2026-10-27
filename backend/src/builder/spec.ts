import { synthesizeProductDefinition } from '../synthesis/productDefinition.js';
import { synthesizeUniversalProductSpec } from '../synthesis/universalProductSpec.js';
import { capabilityRoutingText, detectScaffoldKind, type ScaffoldKind } from '../services/scaffolds/detectScaffold.js';
import { sectionsFromPrompt, titleFromPrompt } from '../services/scaffolds/deterministicSite.js';
import { BuilderError, type BuildSpec } from './types.js';

const MAX_PROMPT = 8_000;

/** Capabilities that need a real external credential or billing relationship. */
const INTEGRATION_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(stripe|payments?|checkout|billing|subscriptions?)\b/i, 'payments'],
  [/\b(send(s|ing)? emails?|transactional emails?|newsletter|email notifications?)\b/i, 'email_delivery'],
  [/\b(sms|text messages?|whatsapp)\b/i, 'messaging'],
  [/\b(summari[sz]e|ai[- ]powered|gpt|llm|chatbot|generate[sd]? with ai)\b/i, 'ai_model'],
];

const AUTH_RE = /\b(auth|authentication|login|log in|sign ?up|sign ?in|accounts?|users? must|different users|admin (dashboard|view|panel)|staff)\b/i;
const DATABASE_RE = /\b(database|saved data|persist|stores?|stored|bookings?|reservations?|appointments?|tasks?|inventory|orders?|history|crud|records?)\b/i;
const BACKEND_RE = /\b(api|backend|server|dashboard|booking|crud|saas|admin|workflow|upload)\b/i;

/**
 * Extracts the build specification for a request by adapting the canonical product-definition
 * and universal-spec synthesizers. No second spec authority is introduced.
 */
export function deriveBuildSpec(rawPrompt: string): { spec: BuildSpec; scaffold: ScaffoldKind } {
  const prompt = (rawPrompt ?? '').trim();
  if (prompt.length < 8) throw new BuilderError('invalid_input', 'Describe the product you want built (at least a short sentence).');
  if (prompt.length > MAX_PROMPT) throw new BuilderError('invalid_input', `The request is limited to ${MAX_PROMPT} characters.`);

  const definition = synthesizeProductDefinition({ prompt });
  const universal = synthesizeUniversalProductSpec({ prompt });
  const routingText = capabilityRoutingText(prompt);
  const scaffold = detectScaffoldKind(prompt);

  const requiresAuthentication = definition.authentication.required || AUTH_RE.test(routingText);
  const requiresDatabase = DATABASE_RE.test(routingText) && (requiresAuthentication || BACKEND_RE.test(routingText));
  const requiresBackend = requiresAuthentication || requiresDatabase || BACKEND_RE.test(routingText) || scaffold === 'nextjs';

  const requiredIntegrations = INTEGRATION_RULES.filter(([re]) => re.test(routingText)).map(([, id]) => id);

  const sections = sectionsFromPrompt(prompt);
  const pages: Array<{ path: string; purpose: string }> = [{ path: '/', purpose: 'Home' }];
  for (const section of sections) {
    const path = `/${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!pages.some((page) => page.path === path)) pages.push({ path, purpose: section });
  }
  if (requiresAuthentication && !pages.some((page) => page.path === '/login')) pages.push({ path: '/login', purpose: 'Sign in' });
  if (/\bdashboard\b/i.test(routingText) && !pages.some((page) => page.path === '/dashboard')) pages.push({ path: '/dashboard', purpose: 'Dashboard' });

  const workflows = definition.criticalWorkflows.slice(0, 8).map((workflow) => ({
    description: workflow.objective,
    acceptanceCriteria: workflow.evidence.length ? workflow.evidence : workflow.steps.slice(0, 4),
  }));

  const acceptanceCriteria = dedupe([
    'The generated project installs its dependencies and builds without errors.',
    'The development server starts and answers HTTP requests on its declared port.',
    ...universal.acceptanceCriteria,
    ...workflows.flatMap((workflow) => workflow.acceptanceCriteria),
  ]).slice(0, 40);

  const unsupported = dedupe([
    ...definition.unsupportedRequirements,
    ...(scaffold === 'expo' || scaffold === 'chrome' || scaffold === 'electron'
      ? [`${scaffold} products are outside the web product builder; no web substitute will be generated.`]
      : []),
    ...(requiredIntegrations.includes('payments') ? ['Real payments need an authorised payment-provider connection; checkout stays unconfigured until one is verified.'] : []),
    ...(requiredIntegrations.includes('email_delivery') ? ['Email delivery needs a configured email connector; forms record submissions only.'] : []),
    ...(requiredIntegrations.includes('ai_model') ? ['AI features need an authorised model endpoint and budget; none is claimed until verified.'] : []),
  ]);

  const spec: BuildSpec = {
    schemaVersion: '1.0.0',
    objective: universal.objective || definition.objective || prompt.slice(0, 300),
    title: (universal.title || titleFromPrompt(prompt, 'Xroga Project')).slice(0, 120),
    productType: scaffold === 'static' ? 'website' : scaffold === 'nextjs' ? (requiresDatabase ? 'full_stack_app' : 'web_app') : scaffold,
    pages,
    workflows,
    visualRequirements: {
      style: /\b(dark|midnight|noir)\b/i.test(prompt) ? 'dark' : /\b(premium|modern|minimal|playful|corporate)\b/i.exec(prompt)?.[0]?.toLowerCase(),
      responsive: true,
      accessibilityRequired: true,
    },
    technicalRequirements: {
      framework: scaffold === 'nextjs' ? 'nextjs' : scaffold === 'static' ? 'static-web' : undefined,
      requiresBackend,
      requiresAuthentication,
      requiresDatabase,
      requiredIntegrations,
    },
    constraints: dedupe(definition.nonFunctionalRequirements.map((requirement) => requirement.statement)).slice(0, 12),
    acceptanceCriteria,
    unsupported,
  };
  return { spec, scaffold };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
