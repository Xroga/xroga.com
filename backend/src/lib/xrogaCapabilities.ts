import { currentProductTruth } from '../ai/universal/productTruth.js';

/** "What can you do?" fast-path backed by the server capability registry. */
export function isCapabilitiesQuery(input: string): boolean {
  const lower = input.toLowerCase().trim().replace(/[?!.]+$/g, '');
  return (
    /\bwhat (can|do) you (build|create|make|do)( for me)?\b/.test(lower) ||
    /\bwhat you can build\b/.test(lower) ||
    /\bwhat (can|do) xroga\b/.test(lower) ||
    /\bwhat are you capable\b/.test(lower) ||
    /\bwhat do you offer\b/.test(lower) ||
    /\bshow me what you can\b/.test(lower) ||
    /\bwhat can i (build|create|make) (with|on) xroga\b/.test(lower) ||
    /\btell me what you can build\b/.test(lower)
  );
}

export function getXrogaCapabilitiesResponse(): string {
  return `✨ What Xroga can execute\n\n${currentProductTruth()}\n\nTell me the outcome you want; Xroga will select the smallest available capability set and report any real authorization or provider blocker.`;
}
