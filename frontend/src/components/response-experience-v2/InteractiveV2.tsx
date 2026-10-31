'use client';
import { useId, useState, lazy, Suspense, type CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ResponseNodeV2 } from './document';
import { calculateV2, type CalculatorNode } from './calculations';
import { ProseV2 } from './ProseV2';
import styles from './response-v2.module.css';
const Chart = lazy(() => import('./ChartV2'));

export function CalculatorV2({ node }: { node: CalculatorNode }) {
  const initial = () => Object.fromEntries(node.inputs.map(i => [i.id, String(i.value)]));
  const [values, setValues] = useState(initial); const id = useId();
  const result = calculateV2(node, values);
  const axis = node.operation === 'percentage' && node.inputs.length === 2 ? node.inputs[1] : null;
  const curve = result != null && axis?.min != null && axis.max != null && axis.max > axis.min ? Array.from({ length: 21 }, (_, index) => {
    const x = axis.min! + (axis.max! - axis.min!) * index / 20;
    return { input: Number(x.toFixed(8)), result: calculateV2(node, { ...values, [axis.id]: String(x) }) };
  }) : null;
  return <section className={styles.interactive} aria-label={node.title || node.resultLabel}>
    <header><div><h3>{node.title || node.resultLabel}</h3>{node.description && <p>{node.description}</p>}</div><button type="button" onClick={() => setValues(initial())}><RotateCcw size={14} />Reset</button></header>
    <div className={styles.result}><span>{node.resultLabel}</span><output aria-live="polite" aria-atomic="true">{result == null ? 'Unavailable' : result.toLocaleString(undefined, { maximumFractionDigits: node.precision })}{result != null && node.unit ? <small> {node.unit}</small> : null}</output></div>
    <div className={styles.controls}>{node.inputs.map(input => {
      const fill = input.min != null && input.max != null && input.max > input.min ? Math.max(0, Math.min(100, (Number(values[input.id]) - input.min) / (input.max - input.min) * 100)) : 0;
      return <fieldset key={input.id}><legend className={styles.visuallyHidden}>{input.label}</legend>
      <div className={styles.inputHeading}><label htmlFor={`${id}-${input.id}`}>{input.label}{input.unit ? ` (${input.unit})` : ''}</label><input id={`${id}-${input.id}`} aria-label={`${input.label} value`} type="number" min={input.min} max={input.max} step={input.step ?? 'any'} value={values[input.id]} onChange={event => setValues({ ...values, [input.id]: event.target.value })} /></div>
      {input.min != null && input.max != null && input.min < input.max && <><input aria-label={`${input.label} slider`} type="range" min={input.min} max={input.max} step={input.step ?? (input.max - input.min) / 100} value={values[input.id]} style={{ '--range-fill': `${Number.isFinite(fill) ? fill : 0}%` } as CSSProperties} onChange={event => setValues({ ...values, [input.id]: event.target.value })} /><div className={styles.rangeLabels}><span>{input.min.toLocaleString()}</span><span>{input.max.toLocaleString()}</span></div></>}
    </fieldset>; })}</div>
    {result == null && <p role="status">Enter valid values within the stated limits. Division by zero is unavailable.</p>}
    {curve && axis && <Suspense fallback={null}><Chart compact showSourceData={false} node={{ id: `${node.id}:sensitivity`, kind: 'chart', shape: 'line', xKey: 'input', series: [{ key: 'result', label: `${node.resultLabel}${node.unit ? ` (${node.unit})` : ''}` }], rows: curve, summary: `Calculated across ${axis.label.toLowerCase()} (${axis.unit ?? 'input'}), keeping the other input fixed.` }} /></Suspense>}
    <p className={styles.calculationNote}>Illustration calculated from your inputs. No account action is performed.</p>
  </section>;
}

export function TabsV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'tabs' }> }) {
  const [selected, setSelected] = useState(0); const id = useId();
  return <section className={styles.tabSection}><div role="tablist" aria-label={node.title || 'Response sections'} className={styles.tabs}>{node.items.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${index}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? node.items.length - 1 : event.key === 'ArrowRight' ? (selected + 1) % node.items.length : event.key === 'ArrowLeft' ? (selected + node.items.length - 1) % node.items.length : null;
    if (next != null) { event.preventDefault(); setSelected(next); document.getElementById(`${id}-${next}`)?.focus(); }
  }}>{item.label}</button>)}</div><div id={`${id}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-${selected}`}><ProseV2 text={node.items[selected].content} /></div></section>;
}
