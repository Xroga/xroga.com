'use client';
import { useId, useRef, useState, useContext, useEffect, lazy, Suspense, type ComponentType, type CSSProperties, type KeyboardEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ResponseNodeV2 } from './document';
import type { CitationSource } from '@/lib/xrogaCitations';
import { calculateV2, derivedCalculationsV2, type CalculatorNode } from './calculations';
import { ProseV2 } from './ProseV2';
import { InteractionScopeV2 } from './interactionContext';
import { restoreScenarioV2, saveScenarioV2 } from './interactionState';
import styles from './response-v2.module.css';
import type { ScenarioRangeProps } from '../response-openui/upstream/slider';
const Chart = lazy(() => import('./ChartV2'));

export function CalculatorV2({ node, Range }: { node: CalculatorNode; Range?: ComponentType<ScenarioRangeProps> }) {
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
      {input.min != null && input.max != null && input.min < input.max && (Range
        ? <Range label={input.label} unit={input.unit} min={input.min} max={input.max} step={input.step ?? (input.max - input.min) / 100}
          value={values[input.id] ?? ''} onChange={value => updateValues({ ...values, [input.id]: value })} />
        : <><input aria-label={`${input.label} slider`} type="range" min={input.min} max={input.max} step={input.step ?? (input.max - input.min) / 100} value={values[input.id]} style={{ '--range-fill': `${Number.isFinite(fill) ? fill : 0}%` } as CSSProperties} onChange={event => updateValues({ ...values, [input.id]: event.target.value })} /><div className={styles.rangeLabels}><span>{input.min.toLocaleString()}</span><span>{input.max.toLocaleString()}</span></div></>)}
    </fieldset>; })}</div>
    <div className={styles.result}><div><span>{node.resultLabel}</span></div><output aria-live="polite" aria-atomic="true">{result == null ? 'Unavailable' : result.toLocaleString(undefined, { maximumFractionDigits: node.precision })}{result != null && node.unit ? <small> {node.unit}</small> : null}</output></div>
    {result == null && <p role="status">Enter valid values within the stated limits. Division by zero is unavailable.</p>}
    {derivedCalculationsV2(node, values).map(item => <div className={styles.result} key={item.id}><div><span>{item.label}</span></div><output aria-live="polite" aria-atomic="true">{item.value === null ? 'Unavailable' : item.value.toLocaleString(undefined, { maximumFractionDigits: item.precision ?? node.precision })}{item.value !== null && item.unit && <small> {item.unit}</small>}</output></div>)}
    {curve && axis && <Suspense fallback={null}><Chart compact showSourceData={false} node={{ id: `${node.id}:sensitivity`, kind: 'chart', shape: 'line', xKey: 'input', series: [{ key: 'result', label: `${node.resultLabel}${node.unit ? ` (${node.unit})` : ''}` }], rows: curve, summary: `Calculated across ${axis.label.toLowerCase()} (${axis.unit ?? 'input'}), keeping the other input fixed.` }} /></Suspense>}
  </section>;
}

/** All authored sections remain visible. Navigation only moves focus. */
export function TabsV2({ node, sources = [] }: { node: Extract<ResponseNodeV2, { kind: 'tabs' }>; sources?: CitationSource[] }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const count = node.items.length;
  const select = (index: number, focus = false) => {
    const next = (index + count) % count;
    setActive(next);
    if (focus) buttons.current[next]?.focus();
  };
  // WAI-ARIA tabs: arrows, Home and End move between tabs; only the selected panel is shown.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? active + 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? active - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : null;
    if (key === null) return;
    event.preventDefault();
    select(key, true);
  };
  return <section className={styles.tabSection}>
    {node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}
    <div role="tablist" aria-label={node.title || 'Response views'} className={styles.tabs} onKeyDown={onKeyDown}>
      {node.items.map((item, index) => <button key={item.id} ref={element => { buttons.current[index] = element; }} type="button" role="tab" id={`${id}-tab-${index}`}
        aria-selected={index === active} aria-controls={`${id}-panel-${index}`} tabIndex={index === active ? 0 : -1} onClick={() => select(index)}>{item.label}</button>)}
    </div>
    {node.items.map((item, index) => <section key={item.id} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={index !== active} tabIndex={0} className={styles.answerSection}><ProseV2 text={item.content} sources={sources} /></section>)}
  </section>;
}
