import type { Phase1Intent, RoutingPlan } from './types.js';
import { PHASE1_MATH_SYSTEM } from '../prompts/xrogaResponseFormat.js';
import { WOW_ADVISOR_FORMAT } from '../prompts/wowAdvisorPrompt.js';
import { HACKATHON_ADVISOR_FORMAT } from '../prompts/hackathonAdvisorPrompt.js';
import { isHackathonQuery } from '../lib/hackathonResearch.js';
import { getCurrentDateDirective } from '../lib/currentDateContext.js';

const PHASE2_MESSAGE = 'Coming in Phase 2';

const PRICING =
  /\b(price|pricing|cost|revenue|margin|profit|valuation|subscription|monetiz)\b/i;

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
export function buildRoutingPlan(intent: Phase1Intent, message: string, mathQuery = false): RoutingPlan {
  if (mathQuery) {
    return { intent: 'deep_reasoning', primary: 'deepseek_pro', secondary: null };
  }
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
      return message.length > 420 || PRICING.test(message)
        ? { intent, primary: 'grok_fast', secondary: 'deepseek_pro' }
        : { intent, primary: 'grok_fast', secondary: null };
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

const PROFESSIONAL_FORMAT_BASE = WOW_ADVISOR_FORMAT;

function professionalFormatBlock(): string {
  return `${getCurrentDateDirective()}\n${PROFESSIONAL_FORMAT_BASE}`;
}

export function getSystemPromptForIntent(
  intent: Phase1Intent,
  role: 'primary' | 'secondary',
  mathQuery = false,
  userMessage = ''
): string {
  const base =
    'You are Xroga AI. Be clear, practical, and production-oriented. Never mention AI model names or internal routing.';

  if (mathQuery && role === 'primary') {
    return `${base}${PHASE1_MATH_SYSTEM}`;
  }

  if (intent === 'code_generation' && role === 'secondary') {
    return `${base} Review and improve the code architecture. Focus on structure, patterns, and maintainability.`;
  }
  if (intent === 'code_generation' && role === 'primary') {
    return `${base} Generate clean, working code with brief explanations where helpful.`;
  }
  if (intent === 'ui_ux_design' || (intent === 'code_generation' && role === 'secondary')) {
    return `${base} Produce modern UI/UX with polished frontend code (React + Tailwind when appropriate).`;
  }
  if (isHackathonQuery(userMessage) && role === 'primary') {
    return `${base}${getCurrentDateDirective()}\n${HACKATHON_ADVISOR_FORMAT}`;
  }
  if (intent === 'business_advice' && role === 'primary') {
    return `${base}${professionalFormatBlock()} Provide structured business advice with pros/cons, actionable strategies, and a Summary section. Use live web research when provided.`;
  }
  if (intent === 'business_advice' && role === 'secondary') {
    return `${base} Validate financial assumptions, feasibility, and risks.`;
  }
  if (intent === 'general_chat' || intent === 'deep_reasoning') {
    return `${base}${professionalFormatBlock()}`;
  }
  if (intent === 'security_audit') {
    return `${base} Perform a thorough security review. List vulnerabilities and remediation steps.`;
  }
  if (intent === 'architecture_design') {
    return `${base} Design system architecture with diagrams described in text, trade-offs, and component boundaries.`;
  }
  return base;
}
