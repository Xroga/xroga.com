export function requestsEditableChecklist(prompt: string): boolean {
  return /\b(?:checklist|to-do list)\b/i.test(prompt)
    && /\b(?:editable|interactive|clickable|toggleable)\s+(?:local\s+)?(?:checklist|checkboxes|check boxes)\b/i.test(prompt)
    && !/\b(?:no|without|skip|avoid|do not add)\b[^.!?\n]{0,40}\b(?:checklist|checkboxes|check boxes)\b/i.test(prompt);
}

export function checklistFromProse(prose: string): string | undefined {
  const children: string[] = [];
  const states: string[] = [];
  let title = '';
  let items: string[] = [];
  let fence = '';
  const flush = () => {
    if (!items.length) return;
    children.push(...(title ? ['Section(' + JSON.stringify(title) + ', [' + items.join(', ') + '])'] : items));
    items = [];
  };
  for (const line of prose.split(/\r?\n/)) {
    const marker = /^ {0,3}(\x60{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = '';
      continue;
    }
    if (marker) {
      flush();
      fence = marker;
      continue;
    }
    const heading = /^ {0,3}(?:#{1,6}\s+(.+)|\*\*(.+)\*\*)\s*$/.exec(line);
    if (heading) {
      flush();
      title = (heading[1] ?? heading[2]).trim();
      continue;
    }
    const bullet = /^ {0,3}[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/.exec(line);
    if (!bullet) {
      if (line.trim()) flush();
      continue;
    }
    const label = bullet[2].trim();
    // Keep citation and link-bearing lists in prose with their original markup.
    if (!label || /[\[\]<>]/.test(label)) return;
    const state = '$check' + (states.length + 1);
    states.push(state + ' = ' + Boolean(bullet[1]?.toLowerCase() === 'x'));
    items.push('Checkbox(' + state + ', ' + JSON.stringify(label) + ')');
  }
  flush();
  if (!states.length) return;
  return ['root = Col([' + children.join(', ') + '])', ...states].join('\n');
}

/** Recognize a closed series whose period and values are supplied by the user. */
export function suppliedPeriodicSeries(prompt: string) {
  const parsed = /^(?:show|plot|chart|graph)\s+(?:the\s+)?(?:actual\s+)?(daily|weekly|monthly|quarterly|annual)\s+([^:\n]{1,78}):\s*([+\-−\d][+\-−\d., \t]*)$/i.exec(prompt.trim().replace(/[.!?]$/, ''));
  if (!parsed) return;
  const [, period, metric, data] = parsed;
  const title = metric.trim();
  if (!title || /[\[\]<>]/.test(title)) return;
  const values = data.trim().split(/,\s+/);
  if (values.length < 2 || values.length > 120) return;
  const number = /^[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
  if (!values.every(value => number.test(value))) return;
  const labels: Record<string, string> = { daily: 'Day', weekly: 'Week', monthly: 'Month', quarterly: 'Quarter', annual: 'Year' };
  const axis = labels[period.toLowerCase()];
  const rows = values.map((value, index) => ({
    period: axis + ' ' + (index + 1),
    value: Number(value.replace(/,/g, '').replace('−', '-')),
  }));
  if (rows.some(row => !Number.isFinite(row.value) || Math.abs(row.value) > 1e15)) return;
  return 'root = Col([Chart("bar", ' + JSON.stringify(rows) + ', "period", ["value"], "number", null, false, 240, '
    + JSON.stringify({ title: title[0].toUpperCase() + title.slice(1), xLabel: axis, yLabel: title }) + ')])';
}
