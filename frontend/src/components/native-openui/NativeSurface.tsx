'use client';

import './renderer-config';
import { Renderer } from '@openuidev/react-lang';
import { useMemo, useState } from 'react';
import { library } from './library';
import { EvidenceContext, type AnswerSource } from './evidence';
import { MAX_PROGRAM_CHARS, PARTIAL_NATIVE_PRESENTATION_NOTE, validateNativeOpenUi } from '../../../../backend/src/ai/nativeOpenUi';
import { MarkdownBlocks } from './upstream/components/markdown';
import { SourceCitation } from '../terminal/SourceCitation';
import './upstream/components/theme.css';
import './upstream/components/components.css';
import '@xyflow/react/dist/style.css';
import './surface.css';
import 'katex/dist/katex.min.css';

export type NativeAnswer = { text: string; program?: string; library: 'xroga-native-v1'; format: 'xroga-openui-v1' };

export function NativeSurface({ answer, sources, isStreaming = false, showFullText = false }: {
  answer: NativeAnswer; sources?: AnswerSource[]; isStreaming?: boolean; showFullText?: boolean;
}) {
  const verified = useMemo(() => new Map(sources?.map(source => [source.id, source])), [sources]);
  const [failedProgram, setFailedProgram] = useState<string>();
  const [fullTextOpen, setFullTextOpen] = useState(false);
  // Publish the last complete validated prefix while the native parser streams.
  // A partial statement is never handed to the renderer's evaluator.
  const accepted = useMemo(() => {
    if (answer.library !== 'xroga-native-v1' || !answer.program || answer.program.length > MAX_PROGRAM_CHARS) return '';
    const ids = new Set(verified.keys());
    if (validateNativeOpenUi(answer.program, ids, answer.text).ok) return answer.program;
    if (!isStreaming) return '';
    let end = answer.program.length;
    for (let attempts = 0; attempts < 3; attempts += 1) {
      end = answer.program.lastIndexOf('\n', end - 1);
      if (end <= 0) break;
      const prefix = answer.program.slice(0, end);
      if (validateNativeOpenUi(prefix, ids, answer.text).ok) return prefix;
    }
    return '';
  }, [answer.library, answer.program, answer.text, verified, isStreaming]);
  const prose = <MarkdownBlocks text={answer.text} renderCitation={number => {
    const source = verified.get('source-' + number);
    return source ? <SourceCitation source={source} number={number} /> : null;
  }} />;
  const displayProse = answer.text.startsWith(PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n');
  return (
    <section className="xroga-native-openui" aria-label="Answer" dir="auto" aria-busy={isStreaming}>
      {accepted && failedProgram !== accepted
        ? <EvidenceContext.Provider value={verified}>
            {displayProse ? prose : null}
            <Renderer response={accepted} isStreaming={isStreaming} library={library} publishObservability={false}
              onError={errors => { if (errors.some(error => error.severity !== 'warning')) setFailedProgram(accepted); }} />
            {showFullText && !isStreaming && !displayProse && answer.text ? (
              <details className="xroga-native-full-text" onToggle={event => setFullTextOpen(event.currentTarget.open)}>
                <summary>Read full text</summary>
                {fullTextOpen ? prose : null}
              </details>
            ) : null}
          </EvidenceContext.Provider>
        : prose}
    </section>
  );
}
