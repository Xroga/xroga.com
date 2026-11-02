import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { sameChartTableV2, type ResponseDocumentV2, type ResponseNodeV2 } from './document';
import { sourceKeyV2, remarkCitationsV2 } from './sourceRegistry';
import { authoredEntityParagraphV2, leadingEntityV2 } from './entityRegistry';

type Syntax = { type: string; depth?: number; url?: string; value?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Syntax[] };
export type SemanticRoleV2 = 'narrative' | 'steps' | 'comparison' | 'series' | 'scenario' | 'resource' | 'workflow' | 'code' | 'mathematics' | 'notice' | 'progress' | 'evidence';
export type SemanticUnitV2 = {
  type: 'unit'; id: string; role: SemanticRoleV2; node: ResponseNodeV2;
  range?: { start: number; end: number };
  relatedData?: string; sourceKeys: string[]; suppressRepeatedTitle?: boolean;
};
export type SemanticSectionV2 = { type: 'section'; id: string; heading: SemanticUnitV2; level: number; children: SemanticPartV2[] };
export type SemanticPartV2 = SemanticUnitV2 | SemanticSectionV2;
export type CompositionV2 = { parts: SemanticPartV2[]; unplacedSourceKeys: string[] };

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath, { singleDollarTextMath: false });
const roles: Record<ResponseNodeV2['kind'], SemanticRoleV2> = {
  cards: 'comparison',
  prose: 'narrative', code: 'code', table: 'comparison', chart: 'series', calculator: 'scenario',
  graph: 'workflow', resources: 'resource', images: 'resource', citation: 'evidence',
  metrics: 'comparison', tabs: 'scenario', notice: 'notice', accordion: 'narrative',
  timeline: 'steps', progress: 'progress',
};

/** Syntax supplies structure, never facts. Exact source slices keep wording,
 * whitespace, code, units and partially streamed constructs recoverable. */
function proseParts(node: Extract<ResponseNodeV2, { kind: 'prose' }>): SemanticPartV2[] {
  const root = parser.parse(node.text) as Syntax;
  const children = root.children ?? [];
  // Definitions have document-wide scope. Keeping these responses together also
  // avoids duplicate footnote IDs when Markdown renderers are mounted separately.
  if (children.some(n => n.type === 'definition' || n.type === 'footnoteDefinition')) {
    return [{ type: 'unit', id: node.id, node, role: 'narrative', sourceKeys: [], range: { start: 0, end: node.text.length } }];
  }
  const parts: SemanticPartV2[] = [];
  const stack: SemanticSectionV2[] = [];
  const add = (part: SemanticPartV2) => (stack.at(-1)?.children ?? parts).push(part);
  if (!children.length) return [{ type: 'unit', id: node.id, node, role: 'narrative', sourceKeys: [], range: { start: 0, end: node.text.length } }];
  for (let index = 0; index < children.length; index++) {
    const syntax = children[index];
    const start = index === 0 ? 0 : syntax.position?.start.offset ?? 0;
    const end = children[index + 1]?.position?.start.offset ?? node.text.length;
    const id = `${node.id}:${start}`;
    const labeledResources = syntax.type === 'list' && !!syntax.children?.length && syntax.children.every(item => item.children?.[0]?.children?.[0]?.type === 'strong') && syntax.children.filter(item => {
      const label = item.children?.[0]?.children?.[0]?.children?.[0];
      return label?.type === 'text' && leadingEntityV2(label.value ?? '');
    }).length >= 2;
    const resourceList = labeledResources || syntax.type === 'list' && !!syntax.children?.length && syntax.children.every(item => {
      const first = item.children?.[0]?.children?.[0];
      return first?.type === 'link' && !!first.url && !/^\[?\d+\]?$/.test(first.children?.map(child => child.value ?? '').join('') ?? '');
    });
    const role = resourceList || authoredEntityParagraphV2(syntax) ? 'resource' : syntax.type === 'list' ? 'steps' : syntax.type === 'code' ? 'code' : syntax.type === 'math' ? 'mathematics' : syntax.type === 'table' ? 'comparison' : 'narrative';
    const unit: SemanticUnitV2 = { type: 'unit', id, role, node: { ...node, id, title: index === 0 ? node.title : undefined, description: index === 0 ? node.description : undefined, text: node.text.slice(start, end) }, range: { start, end }, sourceKeys: [] };
    if (syntax.type === 'heading') {
      const level = syntax.depth ?? 2;
      while (stack.length && stack.at(-1)!.level >= level) stack.pop();
      const section: SemanticSectionV2 = { type: 'section', id, heading: unit, level, children: [] };
      add(section); stack.push(section);
    } else add(unit);
  }
  return parts;
}

export function flattenCompositionV2(parts: SemanticPartV2[]): SemanticUnitV2[] {
  return parts.flatMap(part => part.type === 'section' ? [part.heading, ...flattenCompositionV2(part.children)] : [part]);
}

export function composeResponseV2(document: ResponseDocumentV2): CompositionV2 {
  const parts: SemanticPartV2[] = [];
  const placed = new Set<string>();
  const sections: SemanticSectionV2[] = [];
  const append = (part: SemanticPartV2) => {
    if (part.type === 'section') {
      while (sections.length && sections.at(-1)!.level >= part.level) sections.pop();
      const section = { ...part, children: [] as SemanticPartV2[] };
      (sections.at(-1)?.children ?? parts).push(section);
      sections.push(section);
      part.children.forEach(append);
    } else (sections.at(-1)?.children ?? parts).push(part);
  };
  const claimKeys = (text: string): string[] => {
    const tree = parser.parse(text) as Syntax;
    remarkCitationsV2(document.sources)()(tree);
    const keys = new Set<string>();
    const visit = (syntax: Syntax) => {
      if (syntax.type === 'link' && syntax.url) {
        const key = sourceKeyV2(syntax.url);
        if (key && document.sources.some(source => sourceKeyV2(source.url) === key)) keys.add(key);
      }
      syntax.children?.forEach(visit);
    };
    visit(tree);
    return [...keys];
  };
  for (const node of document.nodes) {
    if (node.kind === 'prose') {
      const prose = proseParts(node);
      for (const unit of flattenCompositionV2(prose)) {
        if (unit.node.kind !== 'prose') continue;
        unit.sourceKeys = claimKeys(unit.node.text);
        unit.sourceKeys.forEach(key => placed.add(key));
      }
      prose.forEach(append); continue;
    }
    const sourceKeys = node.kind === 'citation' ? [sourceKeyV2(node.url)] : node.kind === 'resources' ? node.items.map(item => item.source && sourceKeyV2(item.source.url)) : [];
    const authoredProse = [node.description ?? '', ...(node.kind === 'notice' ? [node.text] : node.kind === 'tabs' || node.kind === 'accordion' ? node.items.map(item => item.content) : node.kind === 'cards' ? node.items.map(item => item.description ?? '') : [])];
    const keys = [...new Set([...sourceKeys.filter((key): key is string => !!key), ...authoredProse.flatMap(claimKeys)])];
    keys.forEach(key => placed.add(key));
    const related = node.kind === 'chart' ? document.nodes.find(other => other.kind === 'table' && sameChartTableV2(node, other)) : undefined;
    const heading = sections.at(-1)?.heading.node;
    const headingText = heading?.kind === 'prose' ? heading.text.replace(/^\s*#{1,6}\s+/, '').trim() : undefined;
    append({ type: 'unit', id: node.id, node, role: roles[node.kind], sourceKeys: keys, relatedData: related?.id,
      suppressRepeatedTitle: !!node.title && node.title.trim() === headingText });
  }
  // Claim references come from the same Markdown citation grammar as ProseV2.
  // Unreferenced source metadata is retained, never presented as a verified claim.
  return { parts, unplacedSourceKeys: [...new Set(document.sources.map(s => sourceKeyV2(s.url)).filter((key): key is string => !!key && !placed.has(key)))] };
}

export function layoutUnitV2(unit: SemanticUnitV2, width: number): 'reading' | 'wide' | 'stacked-comparison' {
  const node = unit.node;
  if (node.kind === 'table' && width < 560 && node.columns.length >= 2 && node.columns.length <= 4 && node.rows.length <= 8 && node.rows.every(row => node.columns.every(column => typeof row[column.key] !== 'number'))) return 'stacked-comparison';
  return ['comparison', 'series', 'scenario', 'workflow', 'code'].includes(unit.role) ? 'wide' : 'reading';
}
