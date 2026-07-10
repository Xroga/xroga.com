import { callModel } from './providers/base.js';
import { phase1Logger } from './logger.js';
import { PHASE1_INTENTS, type Phase1Intent } from './types.js';

const VALID_INTENTS = new Set<string>(PHASE1_INTENTS);

const CLASSIFIER_SYSTEM = `You are an intent classifier for Xroga AI. Classify the user message into exactly ONE intent.

Valid intents (return only the intent name, lowercase, no punctuation):
- code_generation: write/build/generate code
- code_reading: read/explain/understand code
- architecture_design: system design / architecture
- security_audit: security review / vulnerabilities
- ui_ux_design: UI/UX / frontend design
- business_advice: business / strategy / advice
- deep_reasoning: complex multi-step thinking
- general_chat: casual conversation
- file_analysis: upload and analyse a file
- image_generation: generate/create an image
- browser_automation: automate browser tasks

Rules:
- Return ONLY the intent name, nothing else.
- If uncertain, return: general_chat`;

/** Classify user intent using DeepSeek Flash (cheapest model). */
export async function classifyIntent(message: string): Promise<Phase1Intent> {
  try {
    const result = await callModel('deepseek_flash', {
      systemPrompt: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content: message }],
      maxTokens: 32,
    });

    const raw = result.content.trim().toLowerCase().replace(/[^a-z_]/g, '');
    const intent = VALID_INTENTS.has(raw) ? (raw as Phase1Intent) : 'general_chat';

    phase1Logger.info('Intent classified', {
      intent,
      raw: result.content.trim(),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return intent;
  } catch (err) {
    phase1Logger.warn('Intent classification failed, defaulting to general_chat', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return 'general_chat';
  }
}
