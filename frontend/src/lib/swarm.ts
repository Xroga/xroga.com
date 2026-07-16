/** Extract human-readable text from a Swarm output payload. */
export function swarmOutputToText(output: unknown): string {
  if (!output || typeof output !== 'object') {
    return 'Task complete.';
  }

  const o = output as {
    type?: string;
    content?: string;
    message?: string;
    prompt?: string;
    provider?: string;
    deployUrl?: string;
    imageUrl?: string;
    streamingUrl?: string;
    pdfUrl?: string;
  };

  if (o.type === 'chat' && typeof o.content === 'string') {
    return o.content;
  }
  if (typeof o.message === 'string') {
    return o.message;
  }
  if (o.type === 'landing_page') {
    return '';
  }
  if (o.type === 'image' && o.imageUrl) {
    const alt = (o.prompt ?? 'Generated image').slice(0, 80);
    const provider = o.provider ? `\n\n*Generated via ${o.provider}*` : '';
    return `![${alt}](${o.imageUrl})${provider}`;
  }
  if (o.type === 'video_studio' && o.streamingUrl) {
    const title = (o as { title?: string }).title ?? 'Your video';
    return `**${title}** is ready!\n\n[Watch & download](${o.streamingUrl})`;
  }
  if (o.type === 'deep_research' && o.pdfUrl) {
    return `Research report: ${o.pdfUrl}`;
  }

  return 'Swarm task complete.';
}

export interface SwarmProgressEvent {
  agent?: string;
  status?: string;
  message?: string;
  iteration?: number;
  imageStep?: string;
  videoStep?: string;
  omniPhase?: string;
  omniDetail?: string;
  imageAttempt?: {
    imageUrl: string;
    provider: string;
    matchScore: number;
    issues?: string[];
    variantLabel?: string;
    variantIndex?: number;
  };
  councilLayer?: 'elite' | 'reserve' | 'blackhole';
  negotiationPhase?: number;
  userFacingPhase?: number;
  swarmLogic?: boolean;
  swarmTodos?: SwarmTodoItem[];
  swarmStatusLabel?: string;
  swarmAnalysis?: string;
  swarmActivity?: string;
  needsGitHub?: boolean;
  needsVercel?: boolean;
  deepseekPeak?: boolean;
  heavyBusy?: boolean;
  /** Silent stream keepalive — not real progress; do not reset stall timers */
  keepalive?: boolean;
  hackathonBrief?: import('@/components/terminal/HackathonBriefCard').HackathonBriefCardData;
}

export type SwarmTodoStatus = 'done' | 'active' | 'pending';

export interface SwarmTodoItem {
  id: string;
  label: string;
  status: SwarmTodoStatus;
}

export interface SwarmCompleteEvent {
  runId?: string;
  success?: boolean;
  featureCategory?: string;
  output?: unknown;
  actionsRemaining?: number;
  tokenUsage?: {
    inputTokensUsed?: number;
    outputTokensUsed?: number;
    totalTokensUsed?: number;
    totalTokensRemaining?: number;
    percentUsed?: number;
    inputTokensRemaining?: number;
    outputTokensRemaining?: number;
    quotaPeriodStart?: string;
  };
}
