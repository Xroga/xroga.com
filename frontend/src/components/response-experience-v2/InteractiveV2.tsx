'use client';
import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ResponseNodeV2 } from './document';
import { calculateV2, type CalculatorNode } from './calculations';
import { ProseV2 } from './ProseV2';
import styles from './response-v2.module.css';

export function CalculatorV2({ node }: { node: CalculatorNode }) {
  const initial = () => Object.fromEntries(node.inputs.map(i => [i.id, String(i.value)]));
  const [values, setValues] = useState(initial); const id = useId();
  const result = calculateV2(node, values);
  return <section className={styles.interactive} aria-label={node.title || node.resultLabel}>
    <header><div><h3>{node.title || node.resultLabel}</h3>{node.description && <p>{node.description}</p>}</div><button type="button" onClick={() => setValues(initial())}><RotateCcw size={14} />Reset</button></header>
    {node.inputs.map(input => <fieldset key={input.id}><legend>{input.label}{input.unit ? ` (${input.unit})` : ''}</legend>
      <input aria-label={`${input.label} value`} type="number" min={input.min} max={input.max} step={input.step ?? 'any'} value={values[input.id]} onChange={event => setValues({ ...values, [input.id]: event.target.value })} aria-describedby={`${id}-limits-${input.id}`} />
      {input.min != null && input.max != null && input.min < input.max && <input aria-label={`${input.label} slider`} type="range" min={input.min} max={input.max} step={input.step ?? (input.max - input.min) / 100} value={values[input.id]} onChange={event => setValues({ ...values, [input.id]: event.target.value })} />}
      <small id={`${id}-limits-${input.id}`}>{input.min != null ? `Minimum ${input.min}. ` : ''}{input.max != null ? `Maximum ${input.max}.` : ''}</small>
    </fieldset>)}
    <div className={styles.result}><span>{node.resultLabel}</span><output aria-live="polite" aria-atomic="true">{result == null ? 'Unavailable' : result.toLocaleString(undefined, { maximumFractionDigits: node.precision })}{result != null && node.unit ? ` ${node.unit}` : ''}</output></div>
    {result == null && <p role="status">Enter valid values within the stated limits. Division by zero is unavailable.</p>}
    <small>Local calculation: {node.operation}. Changing inputs doesn’t submit a task or perform an account action.</small>
  </section>;
}

export function TabsV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'tabs' }> }) {
  const [selected, setSelected] = useState(0); const id = useId();
  return <section className={styles.interactive}><div role="tablist" aria-label={node.title || 'Response sections'} className={styles.tabs}>{node.items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${index}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? node.items.length - 1 : event.key === 'ArrowRight' ? (selected + 1) % node.items.length : event.key === 'ArrowLeft' ? (selected + node.items.length - 1) % node.items.length : null;
    if (next != null) { event.preventDefault(); setSelected(next); document.getElementById(`${id}-${next}`)?.focus(); }
  }}>{item.label}</button>)}</div><div id={`${id}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-${selected}`}><ProseV2 text={node.items[selected].content} /></div></section>;
}
