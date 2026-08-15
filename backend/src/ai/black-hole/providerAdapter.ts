/**
 * The Black Hole ∞ provider adapter boundary.
 *
 * The gateway used to call `chatCompletion` directly, which meant the intelligence layer knew
 * about a transport function, its option shape and — through it — the notion of provider URLs
 * and credentials. This module is the seam: above it, code asks for intelligence; below it,
 * one place knows how a model id becomes a request to a vendor.
 *
 * ## It wraps rather than reimplements
 *
 * `openaiCompat` already holds the working, hardened transport: credential resolution, the
 * enforced transport binding, temperature fallback, runtime health recording and error
 * normalization. Duplicating any of that to obtain a tidier boundary would mean two transport
 * paths, one of which is newer and less proven, and the security check that matters most —
 * "Kimi never leaves Moonshot" — would exist in only one of them.
 *
 * So the adapter delegates. What it adds is the part the gateway genuinely needed and did not
 * have: modality negotiation, structured-output handling, and a request shape that carries
 * attachments rather than a pre-flattened string.
 *
 * ## Modality is checked here, not assumed
 *
 * `models.ts` now owns whether a configured endpoint accepts images. The adapter refuses an
 * image for a model without that support instead of silently dropping the attachment and
 * sending the text alone — a silent drop produces a confident answer about an image the model
 * never saw, which is indistinguishable from a bad answer.
 */

import {
  buildVisionUserContent,
  chatCompletion,
  chatCompletionStream,
  type ChatMessage,
  type ChatResult,
  type ContentPart,
} from '../openaiCompat.js';
import { resolveModelSpec, type ModelId } from '../models.js';

export interface AdapterAttachment {
  readonly mediaType: string;
  /** A data: URI or an https URL the provider can fetch. */
  readonly url: string;
  readonly name?: string;
}

export interface AdapterRequest {
  readonly modelId: ModelId;
  readonly messages: readonly ChatMessage[];
  readonly attachments?: readonly AdapterAttachment[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Ask the provider for JSON. The caller still validates — see `structuredOutput.ts`. */
  readonly json?: boolean;
  readonly signal?: AbortSignal;
  readonly credentialOverride?: string;
  readonly onDelta?: (delta: string) => void;
  readonly env?: NodeJS.ProcessEnv;
}

export class ModalityUnsupportedError extends Error {
  readonly code = 'MODALITY_UNSUPPORTED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ModalityUnsupportedError';
  }
}

const IMAGE_MEDIA_RE = /^image\//i;

/** Whether a configured model can genuinely accept an image right now. */
export function supportsImages(modelId: ModelId, env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveModelSpec(modelId, env)?.supportsImages ?? false;
}

/**
 * Folds attachments into the final user message.
 *
 * Images become `image_url` parts on the last user turn, which is where every OpenAI-compatible
 * provider expects them. Non-image attachments are not smuggled in as images: they are the
 * caller's responsibility to have already extracted to text, and pretending a PDF is an image
 * would produce a request the provider rejects for reasons that look nothing like the cause.
 */
export function withAttachments(
  messages: readonly ChatMessage[],
  attachments: readonly AdapterAttachment[],
): ChatMessage[] {
  const images = attachments.filter((file) => IMAGE_MEDIA_RE.test(file.mediaType));
  if (!images.length) return [...messages];

  const result = [...messages];
  const lastUserIndex = result.map((message) => message.role).lastIndexOf('user');
  if (lastUserIndex === -1) {
    result.push({
      role: 'user',
      content: buildVisionUserContent('', images.map((file) => file.url)),
    });
    return result;
  }

  const existing = result[lastUserIndex];
  const text = typeof existing.content === 'string'
    ? existing.content
    : existing.content
        .filter((part): part is Extract<ContentPart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n');

  result[lastUserIndex] = {
    role: 'user',
    content: buildVisionUserContent(text, images.map((file) => file.url)),
  };
  return result;
}

function assertModalitySupported(request: AdapterRequest): void {
  const images = (request.attachments ?? []).filter((file) => IMAGE_MEDIA_RE.test(file.mediaType));
  if (!images.length) return;
  if (supportsImages(request.modelId, request.env)) return;
  throw new ModalityUnsupportedError(
    `This route cannot accept an image. Refusing rather than dropping ${images.length} ` +
      'attachment(s): answering from the text alone would produce a confident description of ' +
      'an image the model never received.',
  );
}

/**
 * One completion, through the canonical transport.
 *
 * Returns `openaiCompat`'s `ChatResult` unchanged. The gateway strips provider identity on the
 * way out to the user; keeping it here means telemetry, health recording and failover all
 * still know which model actually answered.
 */
export async function complete(request: AdapterRequest): Promise<ChatResult> {
  assertModalitySupported(request);
  const messages = request.attachments?.length
    ? withAttachments(request.messages, request.attachments)
    : [...request.messages];

  return chatCompletion(request.modelId, messages, {
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    json: request.json,
    signal: request.signal,
    credentialOverride: request.credentialOverride,
  });
}

/** Streaming variant. Same modality and transport rules. */
export async function completeStream(request: AdapterRequest): Promise<ChatResult> {
  assertModalitySupported(request);
  const messages = request.attachments?.length
    ? withAttachments(request.messages, request.attachments)
    : [...request.messages];

  return chatCompletionStream(request.modelId, messages, {
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    signal: request.signal,
    credentialOverride: request.credentialOverride,
    onDelta: request.onDelta,
  });
}

/** The adapter surface the gateway depends on, so it can be substituted in tests. */
export interface ProviderAdapter {
  complete(request: AdapterRequest): Promise<ChatResult>;
  completeStream(request: AdapterRequest): Promise<ChatResult>;
  supportsImages(modelId: ModelId, env?: NodeJS.ProcessEnv): boolean;
}

export const providerAdapter: ProviderAdapter = { complete, completeStream, supportsImages };
