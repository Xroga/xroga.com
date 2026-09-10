import { z } from 'zod';

export const SEMANTIC_INTENTS = [
  'ANSWER',
  'INVESTIGATE',
  'PROPOSE',
  'MODIFY',
  'EXTERNAL_ACTION',
  'MIXED',
] as const;

export type SemanticIntent = (typeof SEMANTIC_INTENTS)[number];

const projectContextSchema = z.object({
  repo: z.string().trim().min(3),
  branch: z.string().trim().min(1),
  projectRoot: z.string().trim().startsWith('/').default('/'),
}).strict();

const deliverableSchema = z.object({
  id: z.string().trim().min(1),
  mediaType: z.string().trim().regex(/^[\w.+-]+\/[\w.+-]+$/),
  description: z.string().trim().min(1),
  required: z.boolean().default(true),
  acceptance: z.array(z.string().trim().min(1)).default([]),
}).strict();

export const goalContractSchema = z.object({
  version: z.literal('1.0'),
  goal: z.string().trim().min(1),
  desiredOutcome: z.string().trim().min(1),
  semanticIntent: z.enum(SEMANTIC_INTENTS),
  constraints: z.array(z.string().trim().min(1)).default([]),
  acceptance: z.array(z.string().trim().min(1)).default([]),
  historyContext: z.array(z.string()).default([]),
  projectContext: projectContextSchema.nullable().default(null),
  deliverables: z.array(deliverableSchema).default([]),
  requiredCapabilities: z.array(z.string().trim().min(3)).default([]),
  requiredAuthorities: z.array(z.string().trim().min(3)).default([]),
  risks: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  blockers: z.array(z.string()).default([]),
  contextComplexity: z.enum(['low', 'medium', 'high', 'unknown']).default('unknown'),
}).strict();

export type GoalContract = z.infer<typeof goalContractSchema>;
export type ProjectContext = z.infer<typeof projectContextSchema>;

export interface GoalInterpretationInput {
  readonly message: string;
  readonly history: readonly string[];
  readonly projectContext: ProjectContext | null;
  readonly attachments: readonly { mediaType: string; name?: string }[];
  readonly projectState?: Readonly<Record<string, unknown>>;
}

/** Semantic interpretation is injected so this layer has no prompt keyword taxonomy. */
export async function interpretGoalContract(
  input: GoalInterpretationInput,
  interpret: (input: GoalInterpretationInput) => Promise<unknown>,
): Promise<GoalContract> {
  if (!input.message.trim()) throw new Error('A goal cannot be inferred from an empty message.');
  const parsed = goalContractSchema.safeParse(await interpret(input));
  if (!parsed.success) {
    throw new Error(`Goal interpretation returned an invalid contract: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  return parsed.data;
}
