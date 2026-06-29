import { deepSeekChat } from '../../lib/deepseek.js';
import { groqChat } from '../../lib/groq.js';
import type { FeatureCategory, FeatureRoute } from '../../types/features.js';
import { FEATURE_ACTION_COSTS, FEATURE_TASK_TYPES } from '../../types/features.js';
import { computeVideoActionCost, parseVideoDuration } from '../media/videoUtils.js';
import { computeDebugActionCost } from '../debugging/codeDebugger.js';
import { FEATURE_CATALOG, matchFeatureByKeywords, type FeatureCatalogEntry } from '../../config/featureCatalog.js';

const CLASSIFICATION_SYSTEM = `You are the Xroga Architect. Classify user requests into a feature ID from the catalog.
Respond ONLY with JSON: {"featureId":"...","category":"chat|landing_page|image_generation|browser_automation|cross_post|key_creation|video_studio|deep_research|content_blocker|job_hunter|code_debug","confidence":0.0-1.0,"reasoning":"..."}
Pick the closest featureId from: ${FEATURE_CATALOG.slice(0, 30).map((f) => f.id).join(', ')}...`;

const RULE_PATTERNS: Array<{ category: FeatureCategory; patterns: RegExp[] }> = [
  {
    category: 'video_studio',
    patterns: [
      /\b(make|create|generate|produce)\b.*\b(video|movie|film|trailer|anime|clip)\b/i,
      /\bvideo\s+about\b/i,
      /\bomni.?video\b/i,
    ],
  },
  {
    category: 'deep_research',
    patterns: [
      /\b(deep\s+research|research\s+report|phd|cite|cited\s+report)\b/i,
      /\bwrite\s+a\s+report\s+on\b/i,
      /\bcomprehensive\s+(analysis|research)\b/i,
    ],
  },
  {
    category: 'content_blocker',
    patterns: [
      /\b(block|filter|protect)\b.*\b(adult|porn|explicit|nsfw)\b/i,
      /\bcontent\s+blocker\b/i,
      /\bsafe\s+search\b/i,
      /\benable\s+protection\b/i,
    ],
  },
  {
    category: 'job_hunter',
    patterns: [
      /\b(find|search|apply|hunt)\b.*\b(jobs?|career|freelance|upwork|linkedin)\b/i,
      /\bauto\s+apply\b/i,
      /\bjob\s+hunter\b/i,
    ],
  },
  {
    category: 'code_debug',
    patterns: [
      /\b(debug|fix)\b.*\b(code|bug|error|file)\b/i,
      /\bfix\s+(this|my)\s+(code|bug)\b/i,
    ],
  },
  {
    category: 'landing_page',
    patterns: [
      /\b(build|create|make|design)\b.*\b(landing\s*page|website|web\s*page|site)\b/i,
      /\blanding\s*page\b/i,
    ],
  },
  {
    category: 'image_generation',
    patterns: [
      /\b(generate|create|make|draw)\b.*\b(image|picture|logo|art|illustration|photo)\b/i,
      /\bimage\s+of\b/i,
    ],
  },
  {
    category: 'browser_automation',
    patterns: [
      /\b(go\s+to|navigate|open|visit)\b/i,
      /\b(screenshot|scrape|extract|search\s+for)\b/i,
      /\b(amazon|google|website)\b.*\b(search|find)\b/i,
    ],
  },
  {
    category: 'cross_post',
    patterns: [
      /\b(post|share|publish|cross.?post)\b.*\b(twitter|linkedin|instagram|facebook|x)\b/i,
      /\bpost\s+this\s+to\b/i,
    ],
  },
  {
    category: 'key_creation',
    patterns: [
      /\b(connect|integrate|setup|set\s+up)\b.*\b(openai|stripe|github|api\s*key)\b/i,
      /\bcreate\s+api\s+key\b/i,
    ],
  },
];

function catalogToRoute(entry: FeatureCatalogEntry): FeatureRoute {
  const category = mapCatalogToCategory(entry);
  return {
    category,
    taskType: FEATURE_TASK_TYPES[category],
    actionCost: entry.actionCost || FEATURE_ACTION_COSTS[category],
    confidence: 0.9,
    reasoning: `Catalog match: ${entry.name} → ${entry.agent}`,
    featureId: entry.id,
    agent: entry.agent,
    systemPrompt: entry.systemPrompt,
  };
}

function mapCatalogToCategory(entry: FeatureCatalogEntry): FeatureCategory {
  const id = entry.id;
  const map: Record<string, FeatureCategory> = {
    landing_page: 'landing_page',
    website_gen: 'landing_page',
    image_generation: 'image_generation',
    browser_automation: 'browser_automation',
    browser_scrape: 'browser_automation',
    cross_post: 'cross_post',
    social_posting: 'cross_post',
    key_creation: 'key_creation',
    api_vault: 'key_creation',
    video_studio: 'video_studio',
    ai_video: 'video_studio',
    full_episode: 'video_studio',
    deep_research: 'deep_research',
    web_research: 'deep_research',
    content_blocker: 'content_blocker',
    safe_browser: 'content_blocker',
    job_hunter: 'job_hunter',
    code_debug: 'code_debug',
    code_generation: 'code_debug',
  };
  return map[id] ?? 'chat';
}

function classifyByRules(prompt: string): FeatureRoute {
  // Strong intent rules first — beats weak catalog keyword scoring
  for (const { category, patterns } of RULE_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      return {
        category,
        taskType: FEATURE_TASK_TYPES[category],
        actionCost: FEATURE_ACTION_COSTS[category],
        confidence: 0.9,
        reasoning: `Rule-based match for ${category}`,
      };
    }
  }

  const catalog = matchFeatureByKeywords(prompt);
  if (catalog) return catalogToRoute(catalog);

  return {
    category: 'chat',
    taskType: FEATURE_TASK_TYPES.chat,
    actionCost: FEATURE_ACTION_COSTS.chat,
    confidence: 0.5,
    reasoning: 'Default chat classification',
  };
}

function parseDeepSeekClassification(raw: string, prompt: string): FeatureRoute | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      category?: string;
      featureId?: string;
      confidence?: number;
      reasoning?: string;
    };

    if (parsed.featureId) {
      const entry = FEATURE_CATALOG.find((f) => f.id === parsed.featureId);
      if (entry) return catalogToRoute(entry);
    }

    const validCategories: FeatureCategory[] = [
      'chat', 'landing_page', 'image_generation', 'browser_automation', 'cross_post', 'key_creation',
      'video_studio', 'deep_research', 'content_blocker', 'job_hunter', 'code_debug',
    ];

    if (!parsed.category || !validCategories.includes(parsed.category as FeatureCategory)) {
      return null;
    }

    const category = parsed.category as FeatureCategory;
    return {
      category,
      taskType: FEATURE_TASK_TYPES[category],
      actionCost: FEATURE_ACTION_COSTS[category],
      confidence: parsed.confidence ?? 0.9,
      reasoning: parsed.reasoning ?? 'DeepSeek classification',
    };
  } catch {
    return classifyByRules(prompt);
  }
}

/**
 * Architect (DeepSeek-V4 Flash) parses the user prompt and maps to the correct feature category.
 * Falls back to rule-based classification when API is unavailable.
 */
export async function classifyFeature(prompt: string): Promise<FeatureRoute> {
  const rules = classifyByRules(prompt);

  // Fast path: rule match or simple chat — skip slow LLM classification
  if (rules.confidence >= 0.85) return rules;
  if (rules.category === 'chat' && prompt.length < 300) {
    const catalog = matchFeatureByKeywords(prompt);
    if (catalog) return catalogToRoute(catalog);
    return rules;
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const response = await groqChat(
        [
          { role: 'system', content: CLASSIFICATION_SYSTEM },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 256 }
      );
      const classified = parseDeepSeekClassification(response, prompt);
      if (classified) return classified;
    } catch {
      /* try deepseek */
    }
  }

  try {
    const response = await deepSeekChat(
      [
        { role: 'system', content: CLASSIFICATION_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { model: 'deepseek-chat', maxTokens: 256 }
    );

    const classified = parseDeepSeekClassification(response, prompt);
    if (classified) return classified;
  } catch (err) {
    console.error('[Architect] DeepSeek classification failed, using rules:', (err as Error).message);
  }

  return classifyByRules(prompt);
}

export function getCrossPostPlatformCount(prompt: string): number {
  const p = prompt.toLowerCase();
  let count = 0;
  if (/\b(twitter|x)\b/.test(p)) count++;
  if (/\blinkedin\b/.test(p)) count++;
  if (/\binstagram\b/.test(p)) count++;
  if (/\bfacebook\b/.test(p)) count++;
  return Math.max(count, 1);
}

export function computeFeatureActionCost(category: FeatureCategory, prompt: string, extra?: { lineCount?: number }): number {
  switch (category) {
    case 'cross_post':
      return getCrossPostPlatformCount(prompt);
    case 'video_studio':
      return computeVideoActionCost(parseVideoDuration(prompt));
    case 'code_debug':
      return computeDebugActionCost(extra?.lineCount ?? 100);
    default:
      return FEATURE_ACTION_COSTS[category];
  }
}
