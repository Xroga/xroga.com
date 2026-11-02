import type { ResponseNodeV2 } from './document';

type Graph = Extract<ResponseNodeV2, { kind: 'graph' }>;

/** A deliberately finite data grammar, not a Mermaid/HTML/script interpreter.
 * Unknown syntax stays visible as source code. Original text is never rewritten
 * or replaced in the persisted response or Copy/Share document. */
export function supportedDiagramV2(source: string): Graph | undefined {
  if (source.length > 12_000) return undefined;
  const statements: string[] = [];
  let start = 0, quoted = false, brackets = 0;
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if (c === '"' && source[i - 1] !== '\\') quoted = !quoted;
    if (!quoted && c === '[') brackets++;
    if (!quoted && c === ']') brackets--;
    if (brackets < 0 || brackets > 1) return undefined;
    if (i === source.length || !quoted && brackets === 0 && (c === '\n' || c === ';')) {
      const statement = source.slice(start, i).trim();
      if (statement && !statement.startsWith('%%')) statements.push(statement);
      start = i + 1;
    }
  }
  if (quoted || brackets || statements.length > 300) return undefined;
  const header = statements.shift();
  const sequence = header === 'sequenceDiagram';
  if (!sequence && !/^(?:graph|flowchart) (?:TD|TB|BT|LR|RL)$/.test(header ?? '')) return undefined;
  const nodes = new Map<string, { id: string; label: string }>();
  const edges: Graph['edges'] = [];
  const add = (id: string, label?: string) => {
    const previous = nodes.get(id);
    if (previous && label && previous.label !== id && previous.label !== label) throw new Error('conflicting-label');
    nodes.set(id, { id, label: label ?? previous?.label ?? id });
  };
  try {
    for (const statement of statements) {
      if (sequence) {
        const participant = /^(?:participant|actor) ([A-Za-z][\w.-]{0,79})(?: as (.{1,500}))?$/.exec(statement);
        if (participant) { add(participant[1], participant[2]); continue; }
        const message = /^([A-Za-z][\w.-]{0,79})\s*(?:-->>|->>)\s*([A-Za-z][\w.-]{0,79})\s*:\s*(.{1,500})$/.exec(statement);
        if (!message) return undefined;
        add(message[1]); add(message[2]);
        edges.push({ source: message[1], target: message[2], label: message[3] });
      } else {
        let remaining = statement;
        const takeNode = () => {
          const match = /^([A-Za-z][\w.-]{0,79}?)(?=\[|\s|-->|$)(?:\[("(?:[^"\\]|\\.)*"|[^\]\n]{1,500})\])?\s*/.exec(remaining);
          if (!match) throw new Error('unsupported-node');
          const label = match[2]?.startsWith('"') ? JSON.parse(match[2]) as unknown : match[2];
          if (label != null && (typeof label !== 'string' || !label.trim() || label.length > 500)) throw new Error('invalid-label');
          add(match[1], label as string | undefined); remaining = remaining.slice(match[0].length);
          return match[1];
        };
        let from = takeNode();
        while (remaining) {
          const arrow = /^-->(?:\|([^|\n]{1,500})\|)?\s*/.exec(remaining);
          if (!arrow) return undefined;
          remaining = remaining.slice(arrow[0].length);
          const to = takeNode(); edges.push({ source: from, target: to, ...(arrow[1] ? { label: arrow[1] } : {}) }); from = to;
        }
      }
      if (nodes.size > 100 || edges.length > 200) return undefined;
    }
    if (!nodes.size || !edges.length) return undefined;
    return { id: 'authored-diagram', kind: 'graph', nodes: [...nodes.values()], edges };
  } catch { return undefined; }
}
