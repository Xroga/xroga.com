'use client';

import { defineComponent } from '@openuidev/react-lang';
import { type CSSProperties } from 'react';
import { z } from 'zod/v4';
import { children } from './upstream/components/style';
import { Glyph } from './upstream/components/glyph';
import { inline } from './upstream/components/markdown';
import { useRenderEvidenceCitation } from './evidence';

export const Section = defineComponent({
  name: 'Section',
  props: z.object({ title: z.string().min(1).max(100), children, introduction: z.string().max(450).optional(), icon: z.string().max(48).optional() }),
  description: 'A meaningful subsection. Group its explanation and relevant components together. Use a short heading and optional orientation sentence.',
  component: function SectionView({ props, renderNode }) {
    const renderCitation = useRenderEvidenceCitation();
    return <section className="native-answer-section">
      <h2>{props.icon && <Glyph name={props.icon} size={18} />}{inline(props.title)}</h2>
      {props.introduction && <p>{inline(props.introduction, 'section-introduction', renderCitation)}</p>}
      <div className="iui-col iui-flow">{renderNode(props.children)}</div>
    </section>;
  },
});

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
      <dd aria-live="polite">{props.value}</dd>
      {props.note && <dd className="native-answer-metric-note">{props.note}</dd>}
    </dl>
  ),
});

export const Controls = defineComponent({
  name: 'Controls',
  props: z.object({
    children,
    label: z.string().min(1).max(80),
    columns: z.number().int().min(1).max(3).optional(),
  }),
  description: 'Group related local inputs and reset controls. Name what the inputs change. Multiple columns stack at phone widths.',
  component: ({ props, renderNode }) => (
    <fieldset className="native-answer-controls">
      <legend>{props.label}</legend>
      <div className="native-answer-controls-grid" style={{ '--control-columns': props.columns ?? 1 } as CSSProperties}>
        {renderNode(props.children)}
      </div>
    </fieldset>
  ),
});
