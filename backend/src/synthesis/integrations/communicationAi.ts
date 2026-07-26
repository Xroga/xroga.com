import { createHash } from 'crypto';

export type DeliveryStatus = 'queued' | 'accepted' | 'delivered' | 'bounced' | 'complained' | 'failed';
export interface DeliveryRecord { idempotencyKey: string; provider: string; recipientReference: string; status: DeliveryStatus; providerMessageId?: string; attempts: number; updatedAt: string; }
export interface DeliveryStore { load(idempotencyKey: string): Promise<DeliveryRecord | null>; save(record: DeliveryRecord): Promise<void>; }
export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly values = new Map<string, DeliveryRecord>();
  async load(key: string) { return structuredClone(this.values.get(key) ?? null); }
  async save(value: DeliveryRecord) { this.values.set(value.idempotencyKey, structuredClone(value)); }
}
export interface CommunicationProvider { id: string; send(input: { recipient: string; templateId: string; variables: Record<string, string>; idempotencyKey: string }): Promise<{ accepted: boolean; messageId?: string }>; }

export async function sendCommunication(input: { provider: CommunicationProvider; store: DeliveryStore; recipient: string; templateId: string; variables: Record<string, string>; idempotencyKey: string; marketing?: boolean; consent?: boolean; unsubscribeUrl?: string }): Promise<DeliveryRecord> {
  const previous = await input.store.load(input.idempotencyKey);
  if (previous?.providerMessageId) return previous;
  if (input.marketing && (!input.consent || !input.unsubscribeUrl)) throw new Error('marketing communication requires consent and an unsubscribe path');
  const response = await input.provider.send({ recipient: input.recipient, templateId: input.templateId, variables: input.variables, idempotencyKey: input.idempotencyKey });
  const record: DeliveryRecord = { idempotencyKey: input.idempotencyKey, provider: input.provider.id, recipientReference: createHash('sha256').update(input.recipient.toLowerCase()).digest('hex').slice(0, 16), status: response.accepted && response.messageId ? 'accepted' : 'failed', providerMessageId: response.messageId, attempts: (previous?.attempts ?? 0) + 1, updatedAt: new Date().toISOString() };
  await input.store.save(record);
  return record;
}

export interface AiCapabilityRequest { operation: string; input: unknown; inputValidator: (value: unknown) => boolean; outputValidator: (value: unknown) => boolean; maximumAttempts: number; timeoutMs: number; critical: boolean; }
export interface AiCapabilityProvider { id: string; execute(operation: string, input: unknown, signal: AbortSignal): Promise<unknown>; }
export interface AiCapabilityResult { status: 'completed' | 'human_review_required' | 'failed'; provider: string; output?: unknown; attempts: number; evidenceId?: string; blocker?: string; }

export async function executeAiCapability(request: AiCapabilityRequest, providers: AiCapabilityProvider[]): Promise<AiCapabilityResult> {
  if (!request.inputValidator(request.input)) throw new Error('AI capability input schema rejected the request');
  let attempts = 0; let lastError = 'no compatible AI provider';
  for (const provider of providers) {
    if (attempts >= request.maximumAttempts) break;
    attempts += 1;
    try {
      const output = await provider.execute(request.operation, request.input, AbortSignal.timeout(request.timeoutMs));
      if (!request.outputValidator(output)) { lastError = 'AI provider returned an invalid output schema'; continue; }
      return { status: 'completed', provider: provider.id, output, attempts, evidenceId: createHash('sha256').update(JSON.stringify({ provider: provider.id, operation: request.operation, output })).digest('hex') };
    } catch (error) { lastError = error instanceof Error ? error.message : 'AI provider operation failed'; }
  }
  return { status: request.critical ? 'human_review_required' : 'failed', provider: providers[Math.max(0, attempts - 1)]?.id ?? 'none', attempts, blocker: lastError };
}
