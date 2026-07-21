import { isTrivialConversation, isTrivialPrompt } from './promptClassifier';
import {
  analyzeCreation,
  hasDeployableCreation,
  primaryDeploySuggestion,
  type CreationSuggestions,
} from './creationIntelligence';

export type { CreationSuggestions, DeploySuggestion } from './creationIntelligence';
export { analyzeCreation, hasDeployableCreation, primaryDeploySuggestion };

export interface MessageSuggestions {
  followUps: string[];
  refine: string[];
  deploy: CreationSuggestions['deploy'];
  creationType: CreationSuggestions['creationType'];
  creationLabel: string;
}

export function generateMessageSuggestions(userText: string, aiText: string): MessageSuggestions {
  const analysis = analyzeCreation(userText, aiText);

  if (isTrivialConversation(userText, aiText)) {
    return {
      creationType: 'chat',
      creationLabel: 'Chat',
      followUps: [
        'Build a website',
        'Build a Chrome extension',
        'Build an Electron desktop app',
        'Build an Expo mobile app',
      ],
      refine: [],
      deploy: [],
    };
  }

  return {
    creationType: analysis.creationType,
    creationLabel: analysis.creationLabel,
    followUps: analysis.followUps,
    refine: analysis.refine,
    deploy: analysis.deploy,
  };
}

export function isBuildRelated(text: string, userText?: string): boolean {
  if (userText && isTrivialPrompt(userText)) return false;
  if (!userText) return false;
  return hasDeployableCreation(userText, text);
}

/** Build prompts that require GitHub before the negotiation engine runs */
export function requiresGitHubForBuild(prompt: string): boolean {
  const t = prompt.toLowerCase();
  if (
    /\b(build|building|create|creating|make|making|develop|developing)\b[\s\S]{0,100}\b(website|web app|landing|mobile app|game|software|api|script|component|page|blog|portfolio|site)\b/.test(
      t
    )
  ) {
    return true;
  }
  // "simple blog about AI" without the word website — still a site build
  if (
    /\b(build|building|create|make)\b/.test(t) &&
    /\b(blog|landing|portfolio)\b/.test(t) &&
    t.length < 200
  ) {
    return true;
  }
  if (/\b(debug|fix)\b[\s\S]{0,40}\b(code|bug|error|typescript|python)\b/.test(t)) return true;
  // Phase 1 answer continuing a build thread
  if (/\[Previous conversation for context/i.test(prompt)) {
    const prior = prompt.slice(0, prompt.indexOf('[Current message]'));
    if (
      /\b(build|create|make)\b[\s\S]{0,80}\b(website|site|shop|coffee|landing)\b/i.test(prior) &&
      /,\s*[^,\n]+,\s*(yes|no)\b/i.test(routingPrompt(prompt))
    ) {
      return true;
    }
  }
  return false;
}

function routingPrompt(prompt: string): string {
  const match = /\[Current message\]\s*\n([\s\S]*)$/i.exec(prompt.trim());
  return match?.[1]?.trim() ?? prompt.trim();
}
