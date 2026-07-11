import type { Phase1Intent, RoutingPlan } from './types.js';

const PHASE2_MESSAGE = 'Coming in Phase 2';

const UI_KEYWORDS =
  /\b(ui|ux|frontend|react|tailwind|css|landing\s*page|dashboard\s*ui|design\s*system|component\s*library)\b/i;
const ARCH_KEYWORDS =
  /\b(architecture|microservices|system\s*design|scalab|infrastructure|distributed)\b/i;
const SECURITY_CRITICAL = /\b(critical|high\s*security|enterprise|production\s*security)\b/i;
const SECURE_KEYWORD = /\b(secure|security|vulnerabilit)\b/i;

function isComplexCode(message: string): boolean {
  return message.length > 200 || ARCH_KEYWORDS.test(message);
}

function wantsUi(message: string): boolean {
  return UI_KEYWORDS.test(message);
}

function isSecurityCritical(message: string): boolean {
  return SECURITY_CRITICAL.test(message);
}

/** Build routing plan from classified intent and message content. */
export function buildRoutingPlan(intent: Phase1Intent, message: string): RoutingPlan {
  switch (intent) {
    case 'code_generation': {
      if (wantsUi(message)) {
        return { intent, primary: 'deepseek_flash', secondary: 'claude_sonnet' };
      }
      if (isSecurityCritical(message) || (SECURE_KEYWORD.test(message) && message.length > 80)) {
        return { intent, primary: 'deepseek_flash', secondary: 'claude_opus' };
      }
      if (isComplexCode(message)) {
        return { intent, primary: 'deepseek_flash', secondary: 'deepseek_pro' };
      }
      return { intent, primary: 'deepseek_flash', secondary: null };
    }
    case 'code_reading':
      return { intent, primary: 'deepseek_flash', secondary: null };
    case 'architecture_design':
      return { intent, primary: 'deepseek_pro', secondary: null };
    case 'security_audit':
      return {
        intent,
        primary: 'deepseek_pro',
        secondary: isSecurityCritical(message) ? 'claude_opus' : null,
      };
    case 'ui_ux_design':
      return { intent, primary: 'claude_sonnet', secondary: null };
    case 'business_advice':
      return { intent, primary: 'grok_fast', secondary: 'deepseek_pro' };
    case 'deep_reasoning':
      return { intent, primary: 'grok_fast', secondary: null, grokReasoningEffort: 'high' };
    case 'general_chat':
      return { intent, primary: 'deepseek_flash', secondary: null };
    case 'file_analysis':
    case 'image_generation':
    case 'browser_automation':
      return { intent, primary: null, secondary: null, phase2Message: PHASE2_MESSAGE };
    default:
      return { intent: 'general_chat', primary: 'deepseek_flash', secondary: null };
  }
}

export function getSystemPromptForIntent(intent: Phase1Intent, role: 'primary' | 'secondary'): string {
  const base = 'You are Xroga AI. Help the user with their request. Be clear, practical, and production-oriented. Never mention AI model names, providers, or internal routing.';

  if (intent === 'code_generation' && role === 'secondary') {
    return `${base} Review and improve the code architecture. Focus on structure, patterns, and maintainability.`;
  }
  if (intent === 'code_generation' && role === 'primary') {
    return `${base} Generate clean, working code with brief explanations where helpful.`;
  }
  if (intent === 'ui_ux_design' || (intent === 'code_generation' && role === 'secondary')) {
    return `${base} Produce modern UI/UX with polished frontend code (React + Tailwind when appropriate).`;
  }
  if (intent === 'business_advice' && role === 'primary') {
    return `${base} Provide structured business advice with pros/cons and actionable strategies. Use live web research when provided — cite current pricing, trends, and real examples.`;
  }
  if (intent === 'business_advice' && role === 'secondary') {
    return `${base} Validate financial assumptions, feasibility, and risks in the business plan.`;
  }
  if (intent === 'security_audit') {
    return `${base} Perform a thorough security review. List vulnerabilities and remediation steps.`;
  }
  if (intent === 'architecture_design') {
    return `${base} Design system architecture with diagrams described in text, trade-offs, and component boundaries.`;
  }
  if (intent === 'deep_reasoning') {
    return `${base} Think step by step. Provide deep analysis with clear reasoning.`;
  }
  return base;
}
