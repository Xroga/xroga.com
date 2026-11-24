'use client';

import { isElementNode } from '@openuidev/lang-core';
import { defineComponent, useIsStreaming } from '@openuidev/react-lang';
import { useContext, useRef, useState, type CSSProperties } from 'react';
import { z } from 'zod/v4';
import { children } from './upstream/components/style';
import { Glyph } from './upstream/components/glyph';
import { inline, NativeSectionTitle, NativeVisualContent } from './upstream/components/markdown';
import { useRenderEvidenceCitation } from './evidence';
import { nativeReadableTextKey } from '../../../../backend/src/ai/nativeOpenUi';

export const Section = defineComponent({
  name: 'Section',
  props: z.object({ title: z.string().min(1).max(100), children, introduction: z.string().max(450).optional(), icon: z.string().max(48).optional() }),
  description: 'A meaningful subsection. Group its explanation and relevant components together. Use a short heading and optional orientation sentence.',
  component: function SectionView({ props, renderNode }) {
    const renderCitation = useRenderEvidenceCitation();
    const nativeVisuals = useContext(NativeVisualContent);
    const hasHeadingInAnswer = nativeVisuals?.markdownSectionHeadings.has(nativeReadableTextKey(props.title));
    return <section className="native-answer-section" aria-label={hasHeadingInAnswer ? props.title : undefined}>
      {!hasHeadingInAnswer && <h2>{props.icon && <Glyph name={props.icon} size={18} />}{inline(props.title, 'section-title', renderCitation)}</h2>}
      {props.introduction && <p>{inline(props.introduction, 'section-introduction', renderCitation)}</p>}
      <div className="iui-col iui-flow">
        <NativeSectionTitle.Provider value={props.title}>{renderNode(props.children)}</NativeSectionTitle.Provider>
      </div>
    </section>;
  },
});

const shortNumericReadout = /^(?=.{1,12}$)[+\p{Pd}−]?\p{Sc}?\p{Nd}[\p{Nd}.,\u00a0\u202f]*[%\p{Sc}]?$/u;

export const Metric = defineComponent({
  name: 'Metric',
  props: z.object({
    label: z.string().min(1).max(80),
    value: z.union([z.string().max(100), z.number()]),
    note: z.string().max(160).optional(),
    tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger']).optional(),
  }),
  description: 'A prominent single measured or calculated value. Include the unit in a formatted value or the label. Use note for the basis. Tone denotes meaning, not verification.',
  component: ({ props }) => (
    <dl className="native-answer-metric" data-tone={props.tone ?? 'neutral'}>
      <dt>{props.label}</dt>
      <dd aria-live="polite"><span className="native-answer-metric-value"
        data-unbroken={shortNumericReadout.test(String(props.value)) || undefined}>{props.value}</span></dd>
      {props.note && <dd className="native-answer-metric-note">{props.note}</dd>}
    </dl>
  ),
});

function offersDraftCopy(nodes: unknown[]) {
  const fields = nodes.flat(Infinity).filter(isElementNode).filter(node => (
    typeof node.props.label === 'string' && node.props.label.trim() &&
    ['Input', 'TextArea', 'RadioGroup', 'Select', 'DatePicker', 'Checkbox'].includes(node.typeName)
  ));
  return fields.some(node => node.typeName === 'TextArea') || (
    fields.length > 1 && fields.some(node => node.typeName === 'Input' && node.props.type !== 'number')
  );
}

function filledDraftText(group: HTMLFieldSetElement) {
  const lines: string[] = [];
  for (const field of group.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input.iui-input:is([type="text"], [type="date"]), textarea.iui-input, select.iui-input, input[type="radio"], input[type="checkbox"]',
  )) {
    if (field.closest('.native-answer-controls') !== group || field.matches(':disabled') ||
      field.closest('[hidden], [aria-hidden="true"]') || !field.getClientRects().length ||
      getComputedStyle(field).visibility !== 'visible') continue;

    const fieldLabel = field.labels?.[0];
    let label = fieldLabel?.querySelector(':scope > .iui-label')?.textContent;
    let value = field.value.trim();
    if (field instanceof HTMLInputElement && field.type === 'radio') {
      if (!field.checked) continue;
      label = field.closest('.iui-radio-group')?.querySelector(':scope > legend')?.textContent;
      value = fieldLabel?.querySelector('.iui-choice-text > span')?.textContent?.trim() ?? '';
    } else if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      label = fieldLabel?.textContent;
      value = field.checked ? 'Yes' : '';
    } else if (field instanceof HTMLSelectElement && value) {
      value = field.selectedOptions[0]?.label.trim() ?? '';
    }

    if (label?.trim() && value) lines.push(`${label.trim()}: ${value}`);
  }
  return lines.join('\n');
}

export const Controls = defineComponent({
  name: 'Controls',
  props: z.object({
    children,
    label: z.string().min(1).max(80),
    columns: z.number().int().min(1).max(3).optional(),
  }),
  description: 'Group related local inputs and reset controls. Name what the inputs change. Multiple columns stack at phone widths.',
  component: function ControlsView({ props, renderNode }) {
    const group = useRef<HTMLFieldSetElement>(null);
    const [feedback, setFeedback] = useState('');
    const [copying, setCopying] = useState(false);
    const streaming = useIsStreaming();
    const copyDraft = async () => {
      if (!group.current) return;
      const draft = filledDraftText(group.current);
      if (!draft) {
        setFeedback('Enter a value to copy.');
        return;
      }
      setFeedback('');
      setCopying(true);
      try {
        await navigator.clipboard.writeText(draft);
        setFeedback('Filled fields copied.');
      } catch {
        setFeedback('Clipboard unavailable. Select the fields to copy manually.');
      } finally {
        setCopying(false);
      }
    };

    return (
      <fieldset ref={group} className="native-answer-controls" onChange={() => setFeedback('')}>
        <legend>{props.label}</legend>
        <div className="native-answer-controls-grid" style={{ '--control-columns': props.columns ?? 1 } as CSSProperties}>
          {renderNode(props.children)}
        </div>
        {!streaming && offersDraftCopy(props.children) && (
          <div className="native-answer-draft-actions">
            <button type="button" className="iui-button iui-button-sm iui-button-outline" disabled={copying} onClick={copyDraft}>
              <Glyph name="copy" size={14} />Copy filled fields
            </button>
            <span role="status">{feedback}</span>
          </div>
        )}
      </fieldset>
    );
  },
});
