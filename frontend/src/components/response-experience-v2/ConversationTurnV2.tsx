'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { MessageShareModal } from '@/components/terminal/MessageShareModal';
import { serializeAssistantCopy } from '@/lib/assistantCopy';
import { conversationStatusV2 } from './conversation';
import styles from './conversation-v2.module.css';

function TurnActions({ role, content, prompt }: { role: 'user' | 'assistant'; content: string; prompt?: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [sharing, setSharing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(role === 'assistant' ? serializeAssistantCopy(content) : content);
      setCopyState('copied');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopyState('idle'), 1800);
    } catch { setCopyState('failed'); }
  }
  if (!content.trim()) return null;
  return <>
    <div className={styles.actions} aria-label={role === 'user' ? 'Your message actions' : 'Answer actions'}>
      <button type="button" onClick={() => void copy()} aria-label={copyState === 'copied' ? 'Copied' : 'Copy message'} title="Copy message">{copyState === 'copied' ? <Check /> : <Copy />}</button>
      <button type="button" onClick={() => setSharing(true)} aria-label="Share message" title="Share message"><Share2 /></button>
      <span role="status">{copyState === 'failed' ? 'Could not copy. Select the text to copy it.' : copyState === 'copied' ? 'Copied' : ''}</span>
    </div>
    <MessageShareModal open={sharing} onClose={() => setSharing(false)} prompt={role === 'assistant' ? prompt : undefined} response={content} contentLabel={role === 'user' ? 'prompt' : 'answer'} />
  </>;
}

/** Whole-turn presentation only. Submission, approvals and task mutations remain
 * owned by the canonical Workspace and arrive as unchanged control slots. */
export function ConversationTurnV2({ role, content, copyContent = content, prompt, streaming, activity, controls, children }: {
  role: 'user' | 'assistant'; content: string; copyContent?: string; prompt?: string;
  streaming: boolean; activity?: ReactNode; controls?: ReactNode; children?: ReactNode;
}) {
  const status = conversationStatusV2(streaming, content);
  return <div className={styles.turn} data-conversation-turn-v2={role}>
    {role === 'user' ? <>
      <div className={styles.userMessage} dir="auto">{content}</div>
      <TurnActions role={role} content={content} />
    </> : <>
      {activity && <div className={styles.activity}>{activity}</div>}
      {status && <div className={styles.status} role="status"><span aria-hidden="true" />{status}</div>}
      {controls && <div className={styles.controls}>{controls}</div>}
      <div className={styles.answer}>{children}</div>
      {!streaming && <TurnActions role={role} content={copyContent} prompt={prompt} />}
    </>}
  </div>;
}
