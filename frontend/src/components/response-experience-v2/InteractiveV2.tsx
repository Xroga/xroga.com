'use client';
import { useId, useState, useContext, useEffect, lazy, Suspense, type CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ResponseNodeV2 } from './document';
import type { CitationSource } from '@/lib/xrogaCitations';
import { calculateV2, derivedCalculationsV2, type CalculatorNode } from './calculations';
import { ProseV2 } from './ProseV2';
import { InteractionScopeV2 } from './interactionContext';
import { restoreScenarioV2, saveScenarioV2 } from './interactionState';
import styles from './response-v2.module.css';
const Chart = lazy(() => import('./ChartV2'));

export function CalculatorV2({ node }: { node: CalculatorNode }) {
  const initial = () => Object.fromEntries(node.inputs.map(i => [i.id, String(i.value)]));
  const [values, setValues] = useState(initial); const id = useId();
  const scope = useContext(InteractionScopeV2);
  useEffect(() => {
    if (!scope) return;
    try {
      const restored = restoreScenarioV2(window.sessionStorage, scope, node);
      setValues(restored ?? Object.fromEntries(node.inputs.map(input => [input.id, String(input.value)])));
    } catch { /* Browsers may disable storage. Local interaction remains available. */ }
  }, [scope, node]);
  const updateValues = (next: Record<string, string>) => {
    setValues(next);
    if (scope) {
      try { saveScenarioV2(window.sessionStorage, scope, node, next); } catch { /* Storage is optional. */ }
    }
  };
  const result = calculateV2(node, values);
  const axis = node.operation === 'percentage' && node.inputs.length === 2 ? node.inputs[1] : null;
  const curve = result != null && axis?.min != null && axis.max != null && axis.max > axis.min ? Array.from({ length: 21 }, (_, index) => {
    const x = axis.min! + (axis.max! - axis.min!) * index / 20;
    return { input: Number(x.toFixed(8)), result: calculateV2(node, { ...values, [axis.id]: String(x) }) };
  }) : null;
  return <section className={styles.interactive} aria-label={node.title || node.resultLabel}>
    <header><div><h3>{node.title || node.resultLabel}</h3>{node.description && <p>{node.description}</p>}</div><button type="button" onClick={() => updateValues(initial())}><RotateCcw size={14} />Reset</button></header>
    <div className={styles.controls}>{node.inputs.map(input => {
      const fill = input.min != null && input.max != null && input.max > input.min ? Math.max(0, Math.min(100, (Number(values[input.id]) - input.min) / (input.max - input.min) * 100)) : 0;
      return <fieldset key={input.id}><legend className={styles.visuallyHidden}>{input.label}</legend>
      <div className={styles.inputHeading}><label htmlFor={`${id}-${input.id}`}>{input.label}{input.unit ? ` (${input.unit})` : ''}</label><input id={`${id}-${input.id}`} aria-label={`${input.label} value`} type="number" min={input.min} max={input.max} step={input.step ?? 'any'} value={values[input.id]} onChange={event => updateValues({ ...values, [input.id]: event.target.value })} /></div>
      {input.min != null && input.max != null && input.min < input.max && <><input aria-label={`${input.label} slider`} type="range" min={input.min} max={input.max} step={input.step ?? (input.max - input.min) / 100} value={values[input.id]} style={{ '--range-fill': `${Number.isFinite(fill) ? fill : 0}%` } as CSSProperties} onChange={event => updateValues({ ...values, [input.id]: event.target.value })} /><div className={styles.rangeLabels}><span>{input.min.toLocaleString()}</span><span>{input.max.toLocaleString()}</span></div></>}
    </fieldset>; })}</div>
    <div className={styles.result}><div><span>{node.resultLabel}</span></div><output aria-live="polite" aria-atomic="true">{result == null ? 'Unavailable' : result.toLocaleString(undefined, { maximumFractionDigits: node.precision })}{result != null && node.unit ? <small> {node.unit}</small> : null}</output></div>
    {result == null && <p role="status">Enter valid values within the stated limits. Division by zero is unavailable.</p>}
    {derivedCalculationsV2(node, values).map(item => <div className={styles.result} key={item.id}><div><span>{item.label}</span></div><output aria-live="polite" aria-atomic="true">{item.value === null ? 'Unavailable' : item.value.toLocaleString(undefined, { maximumFractionDigits: item.precision ?? node.precision })}{item.value !== null && item.unit && <small> {item.unit}</small>}</output></div>)}
    {curve && axis && <Suspense fallback={null}><Chart compact showSourceData={false} node={{ id: `${node.id}:sensitivity`, kind: 'chart', shape: 'line', xKey: 'input', series: [{ key: 'result', label: `${node.resultLabel}${node.unit ? ` (${node.unit})` : ''}` }], rows: curve, summary: `Calculated across ${axis.label.toLowerCase()} (${axis.unit ?? 'input'}), keeping the other input fixed.` }} /></Suspense>}
  </section>;
}

/** Older tab-shaped answers use their original order as inline sections. */
export function TabsV2({ node, sources = [] }: { node: Extract<ResponseNodeV2, { kind: 'tabs' }>; sources?: CitationSource[] }) {
  return <section className={styles.tabSection}>
    {node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}
    {node.items.map(item => <section key={item.id} className={styles.answerSection}>
      <h4>{item.label}</h4>
      <ProseV2 text={item.content} sources={sources} />
    </section>)}
  </section>;
}
