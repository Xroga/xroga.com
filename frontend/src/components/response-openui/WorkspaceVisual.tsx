'use client';

import './runtime';
import { createLibrary, defineComponent, Renderer } from '@openuidev/react-lang';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { CalculatorNode } from '../response-experience-v2/calculations';
import { DataTableV2 } from '../response-experience-v2/DataV2';
import { CalculatorV2 } from '../response-experience-v2/InteractiveV2';
import { Chart } from './upstream/chart';
import { ScenarioRange } from './upstream/slider';
import { Table } from './upstream/table';
import type { OpenUiNode } from './program';
import styles from './intelligent-ui.module.css';

const ScenarioContext = createContext<CalculatorNode | null>(null);
const Scenario = defineComponent({
  name: 'Scenario',
  description: 'Interactive inputs and deterministic results for an existing Xroga calculator.',
  props: z.object({}),
  component: function ScenarioView() {
    const node = useContext(ScenarioContext);
    if (!node) return null;
    return <CalculatorV2 key={JSON.stringify([node.operation, node.inputs])} node={node} Range={ScenarioRange} />;
  },
});

const library = createLibrary({ components: [Table, Chart, Scenario] });

export default function WorkspaceVisual({ node, program, fallback }: {
  node: OpenUiNode;
  program: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <section className={styles.surface} data-response-openui={node.kind}>
    {node.kind === 'chart' && <>
      {node.title && <h3>{node.title}</h3>}
      <p>{node.summary}</p>
      {node.shape === 'pie' && <p>{node.series[0].label}</p>}
    </>}
    <ScenarioContext.Provider value={node.kind === 'calculator' ? node : null}>
      <Renderer response={program} library={library} publishObservability={false}
        onParseResult={result => { if (result && (!result.root || result.meta.incomplete || result.meta.errors.length)) setFailed(true); }}
        onError={errors => { if (errors.some(error => error.severity !== 'warning')) setFailed(true); }} />
    </ScenarioContext.Provider>
    {node.kind === 'chart' && <details>
      <summary>View chart data</summary>
      <DataTableV2 node={{ kind: 'table', id: `${node.id}:values`, columns: [
        { key: node.xKey, label: node.xKey }, ...node.series,
      ], rows: node.rows }} />
    </details>}
  </section>;
}
