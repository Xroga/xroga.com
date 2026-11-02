import { adaptResponseV2, type ResponseInputV2, type ResponseNodeV2 } from './document';
import { calculateV2, formulaV2, derivedCalculationsV2 } from './calculations';
import { sourceRegistryV2 } from './sourceRegistry';

const scalar = (value: unknown): string => value == null ? '' : String(value);
const lines = (values: (string | undefined)[]) => values.filter(value => value !== undefined && value !== '').join('\n');

/** Export the same validated, ordered document as the canvas. Copy/share must
 * not drop a graph, dataset or assumption merely because it is not prose.
 * Calculators export their original inputs, explicitly, not unsaved UI state. */
export function responseTextV2(input: ResponseInputV2): string | undefined {
  const result = adaptResponseV2(input);
  if (!result.supported) return undefined;
  const document = result.document;
  const body = document.nodes.map((node, index) => {
    const previous = document.nodes[index - 1];
    const previousHeading = previous?.kind === 'prose'
      ? /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(previous.text.trim().split('\n').at(-1) ?? '')?.[1]
      : undefined;
    // A structured table can inherit the immediately preceding authored heading.
    // Emit that heading once while retaining every cell and nonadjacent section.
    const title = previousHeading === node.title?.trim() ? undefined : node.title;
    return lines([title, node.description, nodeText(node)]);
  }).join('\n\n');
  const sources = [...sourceRegistryV2(document).values()];
  return lines([body, sources.length ? '\nReferences\n' + sources.map(source => `${source.title}: ${source.url}`).join('\n') : undefined]);
}

function nodeText(node: ResponseNodeV2): string {
  switch (node.kind) {
    case 'prose': case 'notice': return node.text;
    case 'code': return '```' + (node.language ?? '') + '\n' + node.text + '\n```';
    case 'table': return [node.columns.map(column => column.label).join('\t'), ...node.rows.map(row => node.columns.map(column => scalar(row[column.key])).join('\t'))].join('\n');
    case 'chart': return lines([node.summary, [node.xKey, ...node.series.map(series => series.label)].join('\t'), ...node.rows.map(row => [scalar(row[node.xKey]), ...node.series.map(series => scalar(row[series.key]))].join('\t'))]);
    case 'graph': return lines([
      ...node.nodes.map(item => lines([item.label, item.detail])),
      ...node.edges.map(edge => `${node.nodes.find(item => item.id === edge.source)!.label} → ${node.nodes.find(item => item.id === edge.target)!.label}${edge.label ? ': ' + edge.label : ''}`),
    ]);
    case 'calculator': {
      const values = Object.fromEntries(node.inputs.map(input => [input.id, String(input.value)]));
      const result = calculateV2(node, values);
      return lines(['Original calculation inputs', ...node.inputs.map(input => `${input.label}: ${input.value}${input.unit ? ' ' + input.unit : ''}${input.min != null ? '; minimum ' + input.min : ''}${input.max != null ? '; maximum ' + input.max : ''}`), formulaV2(node, values) ?? undefined, `${node.resultLabel}: ${result == null ? 'Unavailable for these inputs' : result.toFixed(node.precision)}${node.unit ? ' ' + node.unit : ''}`, ...derivedCalculationsV2(node, values).flatMap(item => [item.formula ?? undefined, `${item.label}: ${item.value === null ? 'Unavailable for these inputs' : item.value.toFixed(item.precision ?? node.precision)}${item.unit ? ' ' + item.unit : ''}`])]);
    }
    case 'metrics': return node.items.map(item => `${item.label}: ${scalar(item.value)}${item.unit ? ' ' + item.unit : ''}`).join('\n');
    case 'tabs': return node.items.map(item => lines([item.label, item.content])).join('\n\n');
    case 'accordion': return node.items.map(item => lines([item.title, item.content])).join('\n\n');
    case 'timeline': return node.items.map(item => lines([item.label, item.date, item.status, item.detail])).join('\n\n');
    case 'progress': return node.items.map(item => lines([`${item.label}: ${item.value}/${item.max}${item.unit ? ' ' + item.unit : ''}`, item.status, item.detail])).join('\n\n');
    case 'citation': return lines([node.label, node.url, node.excerpt]);
    case 'images': return node.items.map(item => lines([item.label, item.caption, item.url])).join('\n\n');
    case 'cards': return node.items.map(item => lines([item.title, item.subtitle, item.badge, item.description, item.recommended == null ? undefined : `Recommended: ${item.recommended}`, item.metrics ? Object.entries(item.metrics).map(([label, value]) => `${label}: ${scalar(value)}`).join('\n') : undefined, item.actionLabel, item.url, item.imageUrl])).join('\n\n');
    // Preserve all provider qualifications, dates, time zones, prices and
    // receipts. A reduced marketing summary would silently lose evidence.
    case 'resources': return node.items.map(item => '```json\n' + JSON.stringify(item, null, 2) + '\n```').join('\n\n');
  }
}
