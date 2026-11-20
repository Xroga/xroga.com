type Decision = 'stop' | 'proceed';
type Rule = { terms: string[]; decision: Decision; block?: number };
type Order = { first: string; second: string; block?: number };
type EditorialElement = { typeName: string; props: Record<string, unknown> };
type EditorialVisualReview = { issue: 'decision_conflict' | 'prerequisite_conflict'; fallbackProse?: string };

const ignoredWords = /^(?:a|an|the|any|of|to|with|and|is|was|are|has|have|only|sign|signs|presence|that|condition|fault|it|they)$/;
const damage = /^(?:damag(?:e|ed)|crack(?:ed)?|broken|breakage|torn|split)$/;
const freshState = /\b(?:unless|until|once|after|provided that|as long as|otherwise|no longer)\b/i;
const editorialSignal = /\b(?:if|when|means?|condition|trigger|disposition|outcome|hazardous|unsafe|restricted|before|after)\b/i;
const absent = (keys: readonly string[]) => keys.some(key => key === 'no' || key === 'not' || key === 'without');
const stopOutcome = /\b(?:stop|halt|abort|defer|refer|referral|escalate|reject|quarantine|disqualif(?:y|ied)|leaves? the [\w ]{1,35} path|do not (?:proceed|continue|start|release|operate)|qualified[ -](?:technician|specialist) only)\b/i;
const proceedOutcome = /^(?:proceed|continue|resume|accept|release|dispatch|publish|operate|start|repair|replace|approve|perform|go ahead)\b|\b(?:may|can|is allowed to|is permitted to|should)\s+(?:now\s+)?(?:proceed|continue|resume|perform|start|release|dispatch|publish|repair|replace|fit|approve|run|carry out)\b/i;

function literal(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function surface(text: string): string {
  return text.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function wordKey(word: string): string {
  if (damage.test(word)) return 'damaged';
  return word.replace(/(?<=[a-z]{4})s$/, '');
}

function terms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => !ignoredWords.test(word))
    .map(wordKey))].sort();
}

function decision(outcome: string): Decision | undefined {
  const statement = surface(outcome.split(/;|\botherwise\b/i, 1)[0] ?? '').replace(/^(?:then|decision|outcome)\s*:?\s+/i, '');
  const stop = stopOutcome.exec(statement);
  const proceed = proceedOutcome.exec(statement);
  if (stop && (!proceed || stop.index <= proceed.index)) return 'stop';
  if (proceed) return 'proceed';
}

function addDecision(rules: Rule[], condition: string, outcome: string, block?: number) {
  const result = decision(outcome);
  if (!result || condition.length > 260 || freshState.test(condition)) return;
  // A shared failure descriptor remains in scope for each listed object.
  // Example: damage to the seal or latch describes two states of the same policy.
  let sharedState = '';
  for (const part of condition.split(/,|\bor\b/i)) {
    const keys = terms(part);
    if (!keys.length) continue;
    if (keys.includes('damaged')) sharedState = 'damaged';
    else if (sharedState && keys.length === 1) keys.push(sharedState);
    if (keys.length >= 2 && keys.length <= 14) rules.push({ terms: keys, decision: result, block });
  }
}

function decisionTable(rules: Rule[], headings: unknown[], rows: unknown[], block?: number) {
  const condition = headings.findIndex(value => /^(?:condition|trigger|when)$/i.test(surface(literal(value))));
  const outcome = headings.findIndex(value => /^(?:decision|outcome|disposition)$/i.test(surface(literal(value))));
  if (condition < 0 || outcome < 0) return;
  for (const row of rows) {
    if (Array.isArray(row)) addDecision(rules, literal(row[condition]), literal(row[outcome]), block);
  }
}

function orderKey(value: string): string {
  // Keep order within the label. "Review then draft" and "draft then review"
  // remain distinct, and an absent label cannot create an inferred edge.
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => !ignoredWords.test(word)).map(wordKey).join(' ');
}

function proseRules(text: string, block?: number) {
  const rules: Rule[] = [];
  const order: Order[] = [];
  let unsafeDelegation = false;
  if (!editorialSignal.test(text)) return { rules, order, unsafeDelegation };
  const lines: string[] = [];
  let fence = '';
  for (const line of text.split(/\r?\n/)) {
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker?.[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    if (!/^\s{0,3}>/.test(line)) lines.push(line);
  }
  const cellLine = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|');
  const table = lines.findIndex(line => /^\s*\|?\s*:?-{3,}:?\s*\|(?:\s*:?-{3,}:?\s*\|?)+\s*$/.test(line));
  if (table > 0 && lines[table - 1].includes('|')) {
    const rows: string[][] = [];
    for (let row = table + 1; lines[row]?.includes('|'); row++) rows.push(cellLine(lines[row]));
    decisionTable(rules, cellLine(lines[table - 1]), rows, block);
  }
  for (const line of lines) {
    for (const raw of line.split(/(?<=[.!?])\s+/)) {
      const statement = surface(raw).replace(/^(?:[-#]+|\d+[.)])\s+/, '').replace(/^\[\s?[ xX]\]\s*/, '');
      if (/^(?:(?:bad|wrong|incorrect|unsafe)\s+example|counterexample)\s*:/i.test(statement)) continue;
      const text = statement.replace(/^[^:!?]{0,58}\b(?:policy|rule|constraint|requirement|prerequisite)(?:\s+is)?\s*:\s*/i, '');
      if (hazardousDelegation.test(text)) unsafeDelegation = true;
      const conditional = /^(?:(?:action|decision|rule|outcome)\s*:\s*)?(?:if|when)\s+([^.!?]{4,235}?)\s*(?:,\s*|\bthen\s+)([^.!?]+)$/i.exec(text.replace(/[.!?]$/, ''));
      const consequence = /^(?:[^:]{1,28}:\s*)?([^.!?]{4,255}?)\s+means?\s+([^.!?]+)$/i.exec(text.replace(/[.!?]$/, ''));
      const match = conditional ?? consequence;
      if (match) addDecision(rules, match[1], match[2], block);
      if (!match && text.length <= 160 && !/\b(?:not|never|unless|until|if|when|shouldn.t)\b/i.test(text)) {
        const pair = /^(?:prerequisite:\s*)?([\p{L}\p{N} -]+?)\s+(?:must\s+come\s+)?(before|after)\s+([\p{L}\p{N} -]+?)[.!]?$/iu.exec(text);
        if (!pair) continue;
        const left = orderKey(pair[1]), right = orderKey(pair[3]);
        if (left && right && left !== right) order.push(pair[2].toLowerCase() === 'before'
          ? { first: left, second: right, block } : { first: right, second: left, block });
      }
    }
  }
  return { rules, order, unsafeDelegation };
}

function proseBlocks(text: string): string[] {
  const blocks: string[] = [];
  let fence = '';
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line);
    if (!fence && !line.trim() && current.length) {
      blocks.push(current.join('\n'));
      current = [];
    } else if (fence || line.trim()) {
      current.push(line);
    }
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
    }
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

function conflictRules(rules: Rule[]): Set<Rule> {
  const blocked = rules.filter(rule => rule.decision === 'stop').slice(0, 160);
  return new Set(rules.filter(rule => rule.decision === 'proceed' && blocked.some(restriction =>
    absent(restriction.terms) === absent(rule.terms) && restriction.terms.every(term => rule.terms.includes(term)))));
}

const hazardousDelegation = /^(?:volunteers?|trainees?|novices?|untrained (?:helpers?|workers?))\s+(?:may\s+|can\s+|should\s+)?(?:perform|handle|carry out|supply|do|take on)\b[^.!?\n]{0,65}\b(?:hazardous|unsafe|restricted) (?:tasks?|steps?|work)\b/i;

function reverseOf(a: Order, b: Order): boolean {
  return a.first === b.second && a.second === b.first;
}

function withholdBlocks(blocks: string[], remove: ReadonlySet<number | undefined>): string {
  const remaining = blocks.filter((_, index) => !remove.has(index));
  return remaining.filter((block, index) => {
    const heading = /^(#{1,6})\s+[^\n]+$/.exec(block);
    const next = /^(#{1,6})\s+/.exec(remaining[index + 1] ?? '');
    return !heading || Boolean(remaining[index + 1] && (!next || next[1].length > heading[1].length));
  }).join('\n\n');
}

/** Check supported explicit policy forms. An unrecognized claim remains unverified. */
export function reviewEditorialProse(prose: string, request = ''): string | undefined {
  if (!editorialSignal.test(prose)) return;
  const blocks = proseBlocks(prose);
  const supplied = proseRules(request);
  const narrative = blocks.map((text, block) => proseRules(text, block));
  const rules = [...supplied.rules.filter(rule => rule.decision === 'stop'), ...narrative.flatMap(block => block.rules)];
  const conflicts = conflictRules(rules);
  const remove = new Set([...conflicts].map(rule => rule.block));
  const ordered = narrative.flatMap(block => block.order);
  for (const step of ordered) {
    if (supplied.order.some(required => reverseOf(step, required)) ||
      (!supplied.order.some(required => required.first === step.first && required.second === step.second)
        && ordered.some(other => reverseOf(step, other)))) remove.add(step.block);
  }
  if (rules.some(rule => rule.decision === 'stop')) {
    narrative.forEach((block, index) => {
      if (block.unsafeDelegation) remove.add(index);
    });
  }
  if (remove.size) return withholdBlocks(blocks, remove);
}

function linkedDiagram(props: Record<string, unknown>) {
  const labels = new Map<string, string>();
  for (const node of Array.isArray(props.nodes) ? props.nodes : []) {
    if (node && typeof node.id === 'string' && typeof node.label === 'string') labels.set(node.id, node.label);
  }
  return (Array.isArray(props.links) ? props.links : []).flatMap(link => {
    const from = labels.get(link?.from), to = labels.get(link?.to);
    return from && to ? [{ from, to, condition: literal(link.label) }] : [];
  });
}

function reversesPrerequisite(edges: Order[], requirement: Order): boolean {
  const pending = [requirement.second];
  const visited = new Set(pending);
  while (pending.length) {
    const node = pending.pop();
    if (node === requirement.first) return true;
    for (const edge of edges) {
      if (edge.first !== node || visited.has(edge.second)) continue;
      visited.add(edge.second);
      pending.push(edge.second);
    }
  }
  return false;
}

export function reviewEditorialVisuals(prose: string, elements: Iterable<EditorialElement>, request = ''): EditorialVisualReview | undefined {
  const blocks = editorialSignal.test(prose) ? proseBlocks(prose) : [];
  const narrative = blocks.map((block, index) => proseRules(block, index));
  const supplied = proseRules(request);
  const proseDecisions = [...supplied.rules.filter(rule => rule.decision === 'stop'), ...narrative.flatMap(block => block.rules)];
  const visualDecisions: Rule[] = [];
  const visualOrders: Order[] = [];
  const graphs: Order[][] = [];
  let unsafeDelegation = false;
  const record = (value: unknown) => {
    const item = literal(value);
    if (!item || item === prose) return;
    const findings = proseRules(item);
    visualDecisions.push(...findings.rules);
    visualOrders.push(...findings.order);
    unsafeDelegation ||= findings.unsafeDelegation;
  };
  for (const { typeName, props } of elements) {
    if (typeName === 'Table' && Array.isArray(props.columns) && Array.isArray(props.rows)) {
      decisionTable(visualDecisions, props.columns, props.rows);
    } else if (typeName === 'Diagram') {
      const graph: Order[] = [];
      for (const { from, to, condition } of linkedDiagram(props)) {
        if (condition) addDecision(visualDecisions, condition, to);
        // A marked return path is a retry, not the initial order.
        if (!/\b(?:retry|repeat|return|recheck)\b/i.test(condition)) {
          graph.push({ first: orderKey(from), second: orderKey(to) });
        }
      }
      graphs.push(graph);
      for (const node of Array.isArray(props.nodes) ? props.nodes : []) record(node?.detail);
    }
    if (typeName === 'Code' || typeName === 'Source' || typeName === 'Quote') continue;
    for (const field of ['text', 'title', 'description', 'introduction', 'label', 'trigger', 'content']) record(props[field]);
    if (typeName === 'List' && Array.isArray(props.items)) props.items.forEach(record);
  }
  const decisions = [...proseDecisions, ...visualDecisions];
  const conflicts = conflictRules(decisions);
  const hasStop = decisions.some(rule => rule.decision === 'stop');
  const remove = new Set([...conflicts].map(rule => rule.block).filter(index => index !== undefined));
  if (hasStop) narrative.forEach((entry, index) => {
    if (entry.unsafeDelegation) remove.add(index);
  });
  if (conflicts.size || remove.size || (unsafeDelegation && hasStop)) {
    return { issue: 'decision_conflict', ...(remove.size ? { fallbackProse: withholdBlocks(blocks, remove) } : {}) };
  }
  const prerequisites = [...supplied.order, ...narrative.flatMap(block => block.order)];
  if (prerequisites.some(rule => visualOrders.some(edge => reverseOf(rule, edge))
    || graphs.some(graph => reversesPrerequisite(graph, rule)))) {
    return { issue: 'prerequisite_conflict' };
  }
}
