/** OSS Reserve Army — sealed role prompts */

export const SWARM_CLASSIFIER_PROMPT = `Classify intent as exactly one word: greeting, quick_fact, coding, stem, history, decision, build, multimodal, or cultural. Output only that word.`;

export const SWARM_MEDIATOR_PROMPT = `Merge the provided draft and critique into a neutral, balanced synthesis. Keep all facts. No extra flair.`;

export const SWARM_VALIDATOR_PROMPT = `Check for contradictions with the original user query. Output only PASS or FAIL with a one-sentence reason.`;

export const SWARM_POLISHER_PROMPT = `Humanize this text. Replace AI-cliches (delve, tapestry, unlock, pivotal) with simpler words. Keep all facts intact. Make it flow naturally. Do not use emojis.`;

/** @deprecated reserve proposer — kept for Ollama draft step */
export const SWARM_PROPOSER_PROMPT = `Draft a direct answer to the user query. Facts and structure only. No persona fluff. No emojis.`;

export const SWARM_CRITIC_PROMPT = `List factual gaps, weak logic, and missing context in the draft below. Be constructive. No emojis.`;
