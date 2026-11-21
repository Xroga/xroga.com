'use client';

// Adapted from CopilotKit's searchable ChoicePicker and interrupt confirmation
// patterns at c7815d9ac96f48fb3a64ad8c18e176a870c81763. See COPILOTKIT-LICENSE.
import { defineComponent, reactive, useStateField } from '@openuidev/react-lang';
import { useId, useState } from 'react';
import { z } from 'zod/v4';

export const ChoicePicker = defineComponent({
  name: 'ChoicePicker',
  description: 'Search named options and apply one choice to local presentation state. Useful when reviewing a scenario before changing a calculation. It never approves or performs an external action.',
  props: z.object({
    value: reactive(z.string().max(80)),
    label: z.string().min(1).max(80),
    options: z.array(z.object({
      value: z.string().min(1).max(80),
      label: z.string().min(1).max(80),
      description: z.string().max(140).optional(),
    })).min(2).max(16).refine(items => new Set(items.map(item => item.value)).size === items.length),
  }),
  component: function ChoicePickerView({ props, statementId }) {
    const id = useId();
    const field = useStateField(statementId ?? id, props.value);
    const [filter, setFilter] = useState('');
    const [draft, setDraft] = useState<string>();
    const active = props.options.find(option => option.value === field.value);
    const pending = props.options.find(option => option.value === draft);
    const shown = props.options.filter(option => option.label.toLowerCase().includes(filter.trim().toLowerCase()));
    return <fieldset className="native-choice">
      <legend>{props.label}</legend>
      {props.options.length > 4 && <input type="search" aria-label={'Filter ' + props.label} value={filter}
        placeholder="Filter choices" onChange={event => setFilter(event.target.value.slice(0, 80))} />}
      <div className="native-choice-options">
        {shown.map(option => <label key={option.value}>
          <input type="radio" name={id} checked={(pending ?? active)?.value === option.value}
            onChange={() => setDraft(option.value)} />
          <span>{option.label}{option.description && <small>{option.description}</small>}</span>
        </label>)}
        {!shown.length && <small>No matching choices.</small>}
      </div>
      <div className="native-choice-actions">
        <button type="button" disabled={!pending || pending.value === active?.value}
          onClick={() => { if (pending) field.setValue(pending.value); setDraft(undefined); }}>Apply choice</button>
        {pending && pending.value !== active?.value && <button type="button" onClick={() => setDraft(undefined)}>Cancel</button>}
      </div>
      <small aria-live="polite">{active ? 'Applied: ' + active.label : 'No choice applied'}</small>
    </fieldset>;
  },
});
