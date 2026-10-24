import { Buffer } from 'node:buffer';

export interface ConnectionUiCandidate {
  toolkit: string;
  name: string;
  description?: string;
  logo?: string;
  recommended: boolean;
}

export function connectionCardMarkdown(input: {
  mode: 'read' | 'action';
  task: string;
  message: string;
  candidates: ConnectionUiCandidate[];
}): string {
  const type = input.candidates.length > 1 ? 'provider_choice' : 'connection_required';
  const descriptor = {
    version: 1,
    type,
    mode: input.mode,
    task: input.task,
    title: type === 'provider_choice' ? 'Choose an app' : `Connect ${input.candidates[0]?.name ?? 'app'}`,
    message: input.message,
    candidates: input.candidates,
  };
  const payload = Buffer.from(JSON.stringify(descriptor), 'utf8').toString('base64url');
  return `${input.message}\n\n[Open Xroga Connect](/xroga/tool-ui?payload=${encodeURIComponent(payload)})`;
}
