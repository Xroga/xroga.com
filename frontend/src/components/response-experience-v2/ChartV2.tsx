'use client';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { ResponseNodeV2 } from './document';
import { DataTableV2 } from './DataV2';
import styles from './response-v2.module.css';
const colors = ['#5087e8', '#ad7bc8', '#2a9a89', '#c78a34', '#cc687f', '#747bd1', '#4899ab', '#a7a142'];
export default function ChartV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'chart' }> }) {
  const axes = <><CartesianGrid stroke="currentColor" opacity={0.1} vertical={false} /><XAxis dataKey={node.xKey} tick={{ fill: 'currentColor', fontSize: 12 }} /><YAxis tick={{ fill: 'currentColor', fontSize: 12 }} /><Tooltip contentStyle={{ background: 'var(--card)', color: 'var(--foreground)', borderRadius: 8 }} /><Legend /></>;
  const properties = { data: node.rows, margin: { top: 16, right: 16, left: 0, bottom: 12 }, accessibilityLayer: true };
  const chart = node.shape === 'bar' ? <BarChart {...properties}>{axes}{node.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i]} isAnimationActive={false} />)}</BarChart>
    : node.shape === 'area' ? <AreaChart {...properties}>{axes}{node.series.map((s, i) => <Area key={s.key} dataKey={s.key} name={s.label} stroke={colors[i]} fill={colors[i]} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} />)}</AreaChart>
    : node.shape === 'pie' ? <PieChart><Tooltip /><Legend /><Pie data={node.rows} dataKey={node.series[0].key} nameKey={node.xKey} isAnimationActive={false}>{node.rows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie></PieChart>
    : node.shape === 'scatter' ? <ScatterChart margin={properties.margin}><CartesianGrid opacity={0.1} /><XAxis type="number" dataKey={node.xKey} name={node.xKey} /><YAxis type="number" dataKey={node.series[0].key} name={node.series[0].label} /><Tooltip /><Scatter data={node.rows} fill={colors[0]} isAnimationActive={false} /></ScatterChart>
    : <LineChart {...properties}>{axes}{node.series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={colors[i]} strokeWidth={2} dot={node.rows.length < 30} isAnimationActive={false} connectNulls={false} />)}</LineChart>;
  return <figure className={styles.chart}><figcaption>{node.title || 'Chart'}</figcaption><p>{node.summary}</p><div className={styles.plot} role="img" aria-label={node.summary}><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div><details><summary>View source data</summary><DataTableV2 node={{ id: `${node.id}:data`, kind: 'table', title: node.title || 'Chart source data', columns: [{ key: node.xKey, label: node.xKey }, ...node.series], rows: node.rows }} /></details></figure>;
}
