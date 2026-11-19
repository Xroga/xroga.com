import React, { createContext, Fragment, type ReactNode } from "react";
import katex from "katex";
import { isPresentationLanguage, publicAnswerText } from "@/lib/publicAnswerText";
import { cx, isLongAnswerTable, webUrl } from "./style";
import { staticChartTable } from "./chart";
import { CodePanel } from "./code-panel";
import type { RenderEvidenceCitation } from "../../evidence";
import { nativeReadableTextKey } from "../../../../../../backend/src/ai/nativeOpenUi";

// Markdown builds React elements. Formula HTML comes only from untrusted KaTeX.
// Inline: **bold**, *italic*, ~~strike~~, `code`, [text](https://...).
// Blocks: paragraphs, # headings, - and 1. lists, > quotes, ``` code, ---, | tables |.

// An underscore inside an identifier is literal, even when another identifier
// later in the same paragraph also contains an underscore.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|(?<![\p{L}\p{N}_])__[^_\n]+?__(?![\p{L}\p{N}_]))|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*|(?<![\p{L}\p{N}_])_[^_\s][^_\n]*?_(?![\p{L}\p{N}_]))|(\[[^\]\n]+\]\((?:<[^<>\r\n]+>|[^)\s]+)\))|(\[(\d{1,2})\])|(\\\([^\n]+?\\\))/u;

/** Reuse the registered Math component's bounded, untrusted KaTeX rendering. */
export function MathExpression({ tex, inline = false }: { tex: string; inline?: boolean }) {
  try {
    const html = katex.renderToString(tex, { displayMode: !inline, throwOnError: false, maxExpand: 100, maxSize: 12, trust: false, strict: "ignore", output: "htmlAndMathml" });
    return inline ? <span className="iui-math" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="iui-math is-block" role="group" aria-label="Equation" tabIndex={0} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    // Unexpected typesetter errors must preserve the equation as escaped text,
    // including when this component is itself rendering the readable fallback.
    return inline ? <span className="iui-math">{tex}</span> : <div className="iui-math is-block" role="group" aria-label="Equation" tabIndex={0}>{tex}</div>;
  }
}

export function inline(text: string, key = "i", renderCitation?: RenderEvidenceCitation, cluster = new Set<string>()): ReactNode {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      if (rest.trim()) cluster.clear();
      out.push(rest);
      break;
    }
    if (m.index) {
      const prose = rest.slice(0, m.index);
      if (prose.trim()) cluster.clear();
      out.push(prose);
    }
    const token = m[0];
    const k = `${key}-${n++}`;
    if (!m[5] && !m[6]) cluster.clear();
    if (m[1]) out.push(<code key={k} className="iui-code">{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(token.slice(2, -2), k, renderCitation)}</strong>);
    else if (m[3]) out.push(<s key={k}>{inline(token.slice(2, -2), k, renderCitation)}</s>);
    else if (m[4]) out.push(<em key={k}>{inline(token.slice(1, -1), k, renderCitation)}</em>);
    else if (m[6]) {
      const citation = renderCitation?.(Number(m[7]), undefined, cluster);
      if (citation == null) cluster.clear();
      out.push(<Fragment key={k}>{citation ?? token}</Fragment>);
    }
    else if (m[8]) out.push(<MathExpression key={k} tex={token.slice(2, -2)} inline />);
    else {
      const close = token.indexOf("](");
      const label = token.slice(1, close);
      const rawDestination = token.slice(close + 2, -1);
      const destination = rawDestination.startsWith("<") && rawDestination.endsWith(">")
        ? rawDestination.slice(1, -1)
        : rawDestination;
      const href = webUrl(destination);
      const number = /^(\d{1,3})$/.exec(label)?.[1];
      const citation = number ? renderCitation?.(Number(number), destination, cluster) : null;
      if (citation == null) cluster.clear();
      out.push(
        citation != null ? <Fragment key={k}>{citation}</Fragment> : href ? (
          <a key={k} className="iui-link" href={href} target="_blank" rel="noopener noreferrer">
            {inline(label, k)}
          </a>
        ) : (
          <Fragment key={k}>{inline(label, k)}</Fragment>
        ),
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out.length === 1 ? out[0] : out;
}

type Block =
  | { kind: "p" | "quote"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "code"; text: string; language?: string }
  | { kind: "math"; text: string }
  | { kind: "hr" }
  | { kind: "table"; head: string[]; rows: string[][] };

export const VisibleMarkdownTables = createContext<ReadonlySet<string> | null>(null);
export const NativeVisualContent = createContext<Pick<MarkdownMatches, "tables" | "sectionTables" | "headingTitles" | "titles" | "markdownSectionHeadings" | "checklists"> | undefined>(undefined);

// Only compare scalar cells. Retain distinct data and cells with components.
export function tableContentKey(head: readonly string[], rows: readonly unknown[][]): string | undefined {
  if (!rows.length || rows.some(row => row.length !== head.length || row.some(cell => typeof cell !== "string" && typeof cell !== "number"))) return;
  const plain = (cell: unknown) => String(cell).split(/(`[^`\n]+`)/g)
    .map((part, index) => index % 2 ? part.slice(1, -1) : part.replace(/\[(\d{1,3})\](?:\([^\s)]+\))?/g, ""))
    .join("").trim().replace(/\s+/g, " ")
    .replace(/^the (?=[a-z])/i, "")
    .replace(/^[A-Z](?=[a-z]+ )/, initial => initial.toLowerCase());
  return JSON.stringify([head.map(plain), rows.map(row => row.map(plain))]);
}

function tableHasLinks(head: string[], rows: string[][]): boolean {
  return [head, ...rows].some(row => row.some(value => /\[\d{1,3}\]|\]\(/.test(value)));
}

export function preservedMarkdownTableKeys(text: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const block of blocks(text)) {
    if (block.kind !== "table" || !tableHasLinks(block.head, block.rows)) continue;
    const key = tableContentKey(block.head, block.rows);
    if (key) keys.add(key);
  }
  return keys;
}

function textKey(text: string): string {
  return nativeReadableTextKey(text);
}

// A display Title and the opening Markdown heading may use different typography
// and number-list punctuation. Preserve the numeric signs, code, URLs and citations.
function headingKey(text: string): string {
  return textKey(text).split(/(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g)
    .map((part, index) => index % 2 ? part : part
      .replace(/\s+[–—]\s+|\s*:\s*/g, ':')
      .replace(/−(?=[\p{Sc}]?\d)/gu, "-")
      .replace(/(?<=\d)(?:,\s+and\s+|\s+and\s+)(?=[+\-]?[\p{Sc}]?\d)/gu, ", "))
    .join('');
}

/** A sentence-final citation can sit immediately before or after its period. */
function citationTextKey(text: string): string {
  return textKey(text).replace(/\s*(\[\d{1,2}\](?:\s*\[\d{1,2}\])*)\.$/, (_, citations: string) => ". " + citations);
}

type MarkdownMatches = {
  documents: ReadonlySet<string>;
  paragraphs: ReadonlySet<string>;
  titles: ReadonlySet<string>;
  headingTitles: ReadonlySet<string>;
  markdownSectionHeadings: ReadonlySet<string>;
  sectionTables: ReadonlyMap<string, ReadonlySet<string>>;
  code: ReadonlySet<string>;
  relationships: ReadonlySet<string>;
  tables: ReadonlySet<string>;
  checklists: ReadonlySet<string>;
  listItems: ReadonlySet<string>;
};

type ChecklistItem = { label: string; checked: boolean };

function checklistKey(items: readonly ChecklistItem[]): string {
  return JSON.stringify(items.map(({ label, checked }) => [textKey(label), checked]));
}

function markdownChecklistKey(items: readonly string[]): string | undefined {
  const checkedItems: ChecklistItem[] = [];
  for (const item of items) {
    const marked = /^\[([ xX])\]\s+(.+)$/.exec(item);
    if (!marked || /\[\d{1,3}\]|\]\(/.test(marked[2])) return;
    checkedItems.push({ label: marked[2], checked: marked[1] !== " " });
  }
  return checkedItems.length ? checklistKey(checkedItems) : undefined;
}

function replacesTableSection(
  heading: Extract<Block, { kind: "h" }>, next: Block | undefined, following: Block | undefined,
  tables?: ReadonlySet<string>, sectionTables?: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (next?.kind !== "table" || (following && (following.kind !== "h" || following.level > heading.level))
    || tableHasLinks(next.head, next.rows)) return false;
  const key = tableContentKey(next.head, next.rows);
  return !!(key && tables?.has(key) && sectionTables?.get(textKey(heading.text))?.has(key));
}

/** Match literal content only. Distinct wording and citation markers stay visible. */
export function nativeMarkdownMatches(root: unknown, readInitial: (value: unknown) => unknown = value => value): MarkdownMatches {
  const documents = new Set<string>();
  const staticMarkdownBlocks: Block[][] = [];
  const paragraphs = new Set<string>();
  const titles = new Set<string>();
  const headingTitles = new Set<string>();
  const markdownSectionHeadings = new Set<string>();
  const sectionTables = new Map<string, Set<string>>();
  const code = new Set<string>();
  const relationships = new Set<string>();
  const tables = new Set<string>();
  const checklists = new Set<string>();
  const listItems = new Set<string>();
  function visit(value: unknown, sectionTitle?: string): void {
    if (Array.isArray(value)) { value.forEach(child => visit(child, sectionTitle)); return; }
    if (!value || typeof value !== "object") return;
    const node = value as { type?: string; typeName?: string; props?: Record<string, unknown>; hasDynamicProps?: boolean };
    if (node.type !== "element" || !node.props) {
      Object.values(value).forEach(child => visit(child, sectionTitle));
      return;
    }
    const { props, typeName } = node;
    // The reverse of a study card is deliberately hidden until the user flips
    // it. A matching paragraph in the main answer must stay visible.
    if (typeName === "Flashcard") return;
    if (["Text", "Caption", "Quote"].includes(typeName ?? "") && typeof props.text === "string") paragraphs.add(citationTextKey(props.text));
    if (typeName === "Badge" && typeof props.text === "string" && !/\[\d{1,3}\]|\]\(/.test(props.text)) {
      paragraphs.add(citationTextKey(props.text));
    }
    if (typeName === "Checkbox" && typeof props.label === "string" && !/\[\d{1,3}\]/.test(props.label)) {
      // Saved fallback can contain each checkbox as a separate list block.
      listItems.add(citationTextKey(props.label));
    }
    if (typeName === "Quote" && typeof props.cite === "string") paragraphs.add(citationTextKey(props.cite));
    if (typeName === "Math" && typeof props.tex === "string") paragraphs.add(citationTextKey(props.tex));
    if (typeName === "Popover") for (const value of [props.trigger, props.content]) {
      if (typeof value === "string") paragraphs.add(citationTextKey(value));
    }
    if (typeName === "Text" && Array.isArray(props.text)) {
      const parts = props.text.map(part => {
        if (typeof part === "string") return part;
        if (part?.type !== "element" || part.typeName !== "Source") return undefined;
        const number = /^source-(\d{1,2})$/.exec(part.props?.id ?? "")?.[1];
        return number === undefined ? undefined : `[${number}]`;
      });
      if (parts.every(part => part !== undefined)) paragraphs.add(citationTextKey(parts.join("")));
    }
    if (typeName === "Title" && typeof props.text === "string") {
      titles.add(textKey(props.text));
      headingTitles.add(headingKey(props.text));
      paragraphs.add(citationTextKey(props.text));
    }
    if (typeName === "Metric") {
      const label = readInitial(props.label), value = readInitial(props.value), note = readInitial(props.note);
      if (typeof label === "string" && (typeof value === "string" || typeof value === "number")) paragraphs.add(citationTextKey(label + ': ' + value));
      if (typeof note === "string") paragraphs.add(citationTextKey(note));
    }
    if (typeName === "List" && Array.isArray(props.items)) {
      props.items.forEach(item => { if (typeof item === "string") { paragraphs.add(citationTextKey(item)); listItems.add(citationTextKey(item)); } });
    }
    if (typeName === "ListItem") {
      const text = [props.title, props.description].filter(value => typeof value === "string" && value).join(': ');
      if (text) listItems.add(citationTextKey(text));
    }
    if (typeName === "Tabs") {
      if (typeof props.label === "string") paragraphs.add(citationTextKey(props.label));
      if (Array.isArray(props.tabs)) for (const tab of props.tabs) {
        if (typeof tab?.title === "string") titles.add(textKey(tab.title));
      }
    }
    if (["Section", "Diagram", "Card"].includes(typeName ?? "") && typeof props.title === "string") titles.add(textKey(props.title));
    if (typeName === "Section") sectionTitle = typeof props.title === "string" ? textKey(props.title) : undefined;
    if (typeName === "Section" && typeof props.introduction === "string") paragraphs.add(citationTextKey(props.introduction));
    if (typeName === "Diagram" && Array.isArray(props.nodes) && Array.isArray(props.links)) {
      if (typeof props.title === "string") paragraphs.add(citationTextKey(props.title));
      if (typeof props.description === "string") paragraphs.add(citationTextKey(props.description));
      const labels = new Map(props.nodes.map(node => [node?.id, node?.label]));
      for (const link of props.links) {
        const from = labels.get(link?.from), to = labels.get(link?.to);
        if (typeof from === "string" && typeof to === "string") {
          const label = typeof link.label === "string" && link.label ? ": " + link.label : "";
          relationships.add(textKey(from + " → " + to + label));
        }
      }
    }
    if (typeName === "Code" && typeof props.code === "string" && !isPresentationLanguage(typeof props.language === "string" ? props.language : undefined)) {
      code.add(props.code.trimEnd());
    }
    const markdown = typeName === "Markdown" ? readInitial(props.text) : undefined;
    if (typeof markdown === "string") {
      documents.add(markdown);
      const items = blocks(markdown);
      if (!node.hasDynamicProps) staticMarkdownBlocks.push(items);
      for (const block of items) {
        if (block.kind === "p") paragraphs.add(citationTextKey(block.text));
        if (block.kind === "h") titles.add(textKey(block.text));
        if (block.kind === "code") code.add(block.text.trimEnd());
        if (block.kind === "list") block.items.forEach(item => paragraphs.add(citationTextKey(item)));
      }
    }
    if (typeName === "Table") {
      const columns = readInitial(props.columns), rows = readInitial(props.rows);
      if (Array.isArray(columns) && columns.every(column => typeof column === "string") && Array.isArray(rows) && rows.every(Array.isArray)) {
        const key = tableContentKey(columns, rows);
        if (key) {
          tables.add(key);
          if (sectionTitle !== undefined) {
            const keys = sectionTables.get(sectionTitle) ?? new Set<string>();
            keys.add(key);
            sectionTables.set(sectionTitle, keys);
          }
        }
      }
    }
    if (typeName === "Chart" && !node.hasDynamicProps) {
      const table = staticChartTable(props);
      const key = table && tableContentKey(table.headings, table.rows);
      if (key) tables.add(key);
      if (table?.title) paragraphs.add(citationTextKey(table.title));
      if (table?.note) paragraphs.add(citationTextKey(table.note));
    }
    if ((typeName === "Col" || typeName === "Section" || typeName === "Controls") && Array.isArray(props.children)) {
      const items = props.children.filter(child => child?.typeName === "Checkbox");
      const controls = items.map(child => ({ label: child.props?.label, checked: readInitial(child.props?.checked) }));
      if (controls.length && controls.every(control => typeof control.label === "string")) {
        if (typeName === "Section" && typeof props.title === "string") paragraphs.add(citationTextKey("**" + props.title + "**"));
      }
      if (controls.length && controls.every((control): control is ChecklistItem =>
        typeof control.label === "string" && typeof control.checked === "boolean")) {
        checklists.add(checklistKey(controls));
      }
    }
    Object.values(props).forEach(child => visit(child, sectionTitle));
  }
  visit(root);
  // Keep the authoritative heading in reading order when an extra native
  // section repeats it. An exact native table that owns its heading still wins.
  for (const items of staticMarkdownBlocks) {
    items.forEach((heading, index) => {
      if (heading.kind !== "h" || (index === 0 && headingTitles.has(headingKey(heading.text)))) return;
      if (replacesTableSection(heading, items[index + 1], items[index + 2], tables, sectionTables)) return;
      markdownSectionHeadings.add(textKey(heading.text));
    });
  }
  return { documents, paragraphs, titles, headingTitles, markdownSectionHeadings, sectionTables, code, tables, relationships, checklists, listItems };
}

/** Only remove a complete verbatim document already visible in native Markdown.
 * Do not infer semantic equivalence or drop distinct trailing information. */
export function proseOutsideNativeDocuments(text: string, matches?: MarkdownMatches): string {
  let remaining = text;
  for (const document of [...(matches?.documents ?? [])].sort((a, b) => b.length - a.length)) {
    if (!document) continue;
    let from = 0;
    for (let at = remaining.indexOf(document, from); at >= 0; at = remaining.indexOf(document, from)) {
      const before = remaining.slice(0, at), after = remaining.slice(at + document.length);
      if ((!before || before.endsWith('\n\n')) && (!after || after.startsWith('\n\n'))) {
        remaining = [before.trimEnd(), after.trimStart()].filter(Boolean).join('\n\n');
        break;
      }
      from = at + document.length;
    }
  }
  return remaining;
}

const LIST_ITEM = /^\s{0,3}([-*+]|(\d+)[.)])\s+(.*)$/;
function cells(line: string): string[] {
  const source = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  // A literal pipe in a code span or escaped with a backslash belongs to the
  // cell. Keep the Markdown that the inline renderer still needs to read.
  return source.split(/(`[^`\n]+`|\\\||\|)/u).reduce<string[]>((row, part) => {
    if (part === "|") row.push("");
    else row[row.length - 1] += part === "\\|" ? "|" : part;
    return row;
  }, [""]).map(cell => cell.trim());
}

function blocks(source: string): Block[] {
  const lines = publicAnswerText(source).replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const opening = /^ {0,3}(\x60{3,}|~{3,})[ \t]*([^\s]*)/.exec(line);
    if (opening) {
      const [, fence, language] = opening;
      const body: string[] = [];
      for (i++; i < lines.length; i++) {
        const close = /^ {0,3}(\x60{3,}|~{3,})[ \t]*$/.exec(lines[i])?.[1];
        if (close && close[0] === fence[0] && close.length >= fence.length) break;
        body.push(lines[i]);
      }
      out.push({ kind: "code", text: body.join("\n"), language });
      i++;
      continue;
    }
    const math = /^ {0,3}(\$\$|\\\[)(.*)$/.exec(line);
    if (math) {
      const close = math[1] === "$$" ? "$$" : "\\]";
      const body: string[] = [];
      let end = i;
      let rest = math[2];
      while (!rest.includes(close) && end + 1 < lines.length) {
        body.push(rest);
        rest = lines[++end];
      }
      const at = rest.indexOf(close);
      if (at >= 0 && !rest.slice(at + close.length).trim()) {
        body.push(rest.slice(0, at));
        out.push({ kind: "math", text: body.join("\n").trim() });
        i = end + 1;
        continue;
      }
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push({ kind: "h", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) rows.push(cells(lines[i]));
      out.push({ kind: "table", head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) body.push(lines[i].replace(/^\s*>\s?/, ""));
      out.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = !!item[2];
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const next = LIST_ITEM.exec(lines[i]);
        if (next && !!next[2] === ordered) items.push(next[3]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      out.push({ kind: "list", ordered, start: ordered ? Number(item[2]) : 1, items });
      continue;
    }
    const body: string[] = [];
    for (; i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !/^(#{1,4})\s|^ {0,3}(?:\x60{3,}|~{3,})|^\s*>/.test(lines[i]); i++) body.push(lines[i].trim());
    out.push({ kind: "p", text: body.join(" ") });
  }
  return out;
}

export function MarkdownBlocks({ text, renderCitation, deduplicateTables = false, matches, nativeTables, nativeSectionTables, nativeHeadingTitles, nativeChecklists }: { text: string; renderCitation?: RenderEvidenceCitation; deduplicateTables?: boolean; matches?: MarkdownMatches; nativeTables?: ReadonlySet<string>; nativeSectionTables?: ReadonlyMap<string, ReadonlySet<string>>; nativeHeadingTitles?: ReadonlySet<string>; nativeChecklists?: ReadonlySet<string> }) {
  const seenTables = new Set<string>();
  const items = blocks(text);
  return (
    <>
      {items.map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case "p":
            if (i === 0 && /^(?:\*\*[^*\n]+\*\*|__[^_\n]+__)$/.test(b.text)
              && nativeHeadingTitles?.has(headingKey(b.text))) return null;
            if (matches?.paragraphs.has(citationTextKey(b.text))) return null;
            return <p key={k}>{inline(b.text, k, renderCitation)}</p>;
          case "quote":
            if (matches?.paragraphs.has(citationTextKey(b.text))) return null;
            return <blockquote key={k} className="iui-markdown-quote">
              {b.text.split(/\n\s*\n/).filter(paragraph => paragraph.trim()).map((paragraph, index) =>
                <p key={index}>{inline(paragraph, `${k}-${index}`, renderCitation)}</p>)}
            </blockquote>;
          case "h": {
            const title = textKey(b.text);
            if (i === 0 && nativeHeadingTitles?.has(headingKey(b.text))) return null;
            if (matches?.titles.has(title)) return null;
            // When a matching native Section owns the equivalent table, its
            // heading remains visible. Keep Markdown headings with unique prose.
            if (replacesTableSection(b, items[i + 1], items[i + 2], nativeTables, nativeSectionTables)) return null;
            return (
              <div key={k} role="heading" aria-level={b.level + 1} className={`iui-md-h iui-md-h${b.level}`}>
                {inline(b.text, k, renderCitation)}
              </div>
            );
          }
          case "code":
            if (matches?.code.has(b.text.trimEnd())) return null;
            return <CodePanel key={k} code={b.text} language={b.language} />;
          case "math":
            if (matches?.paragraphs.has(citationTextKey(b.text))) return null;
            return <MathExpression key={k} tex={b.text} />;
          case "hr":
            return <hr key={k} className="iui-divider" />;
          case "list": {
            if (!b.ordered && (nativeChecklists?.size || matches?.checklists.size)) {
              const key = markdownChecklistKey(b.items);
              const previous = items[i - 1];
              const next = items[i + 1];
              // Keep an otherwise empty Markdown section with its checklist.
              const onlySectionContent = previous?.kind === "h" &&
                (!next || (next.kind === "h" && next.level <= previous.level));
              if (!onlySectionContent && key && (nativeChecklists?.has(key) || matches?.checklists.has(key))) return null;
            }
            const entries = b.ordered ? b.items : b.items.filter(item =>
              !matches?.relationships.has(textKey(item)) && !matches?.listItems.has(citationTextKey(item))
              && !matches?.paragraphs.has(citationTextKey(item)));
            if (!entries.length) return null;
            const elements = entries.map((item, j) => <li key={j}>{inline(item, `${k}-${j}`, renderCitation)}</li>);
            return b.ordered ? (
              <ol key={k} start={b.start}>
                {elements}
              </ol>
            ) : (
              <ul key={k}>{elements}</ul>
            );
          }
          case "table": {
            const tableKey = deduplicateTables || matches || nativeTables ? tableContentKey(b.head, b.rows) : undefined;
            if (tableKey && !tableHasLinks(b.head, b.rows) && (seenTables.has(tableKey) || matches?.tables.has(tableKey) || nativeTables?.has(tableKey))) return null;
            if (tableKey) seenTables.add(tableKey);
            return (
              <div key={k} className={cx("iui-table-scroll", isLongAnswerTable(b.rows.length) && "iui-table-bounded")} role="group" aria-label="Answer table" tabIndex={0}>
                <table className="iui-table">
                  <thead>
                    <tr>{b.head.map((h, j) => h.trim()
                      ? <th key={j} scope="col">{inline(h, `${k}-h${j}`, renderCitation)}</th>
                      : <td key={j} />)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, m) => <td key={m}>{inline(c, `${k}-${j}-${m}`, renderCitation)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }
      })}
    </>
  );
}
