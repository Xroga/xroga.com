/** Extract human-readable text from a Swarm output payload. */
export function swarmOutputToText(output: unknown): string {
  if (!output || typeof output !== 'object') {
    return 'Task complete.';
  }

  const o = output as {
    type?: string;
    content?: string;
    message?: string;
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
  if (o.type === 'landing_page' && o.deployUrl) {
    return `Landing page deployed: ${o.deployUrl}`;
  }
  if (o.type === 'image' && o.imageUrl) {
    return `Image ready: ${o.imageUrl}`;
  }
  if (o.type === 'video_studio' && o.streamingUrl) {
    return `Video ready: ${o.streamingUrl}`;
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
}

export interface SwarmCompleteEvent {
  runId?: string;
  success?: boolean;
  featureCategory?: string;
  output?: unknown;
  actionsRemaining?: number;
}
