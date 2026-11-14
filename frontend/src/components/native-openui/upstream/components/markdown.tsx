import React, { createContext, Fragment, type ReactNode } from "react";
import { isPresentationLanguage, publicAnswerText } from "@/lib/publicAnswerText";
import { cx, isLongAnswerTable, webUrl } from "./style";

// A small Markdown renderer that builds React elements and never injects HTML.
// Inline: **bold**, *italic*, ~~strike~~, `code`, [text](https://...).
// Blocks: paragraphs, # headings, - and 1. lists, > quotes, ``` code, ---, | tables |.

// An underscore inside an identifier is literal, even when another identifier
// later in the same paragraph also contains an underscore.
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|(?<![\p{L}\p{N}_])__[^_\n]+?__(?![\p{L}\p{N}_]))|(~~[^~\n]+?~~)|(\*[^*\s][^*\n]*?\*|(?<![\p{L}\p{N}_])_[^_\s][^_\n]*?_(?![\p{L}\p{N}_]))|(\[[^\]\n]+\]\([^)\s]+\))|(\[(\d{1,2})\])/u;
type RenderCitation = (number: number, href?: string) => ReactNode;

export function inline(text: string, key = "i", renderCitation?: RenderCitation): ReactNode {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index) out.push(rest.slice(0, m.index));
    const token = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k} className="iui-code">{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(token.slice(2, -2), k, renderCitation)}</strong>);
    else if (m[3]) out.push(<s key={k}>{inline(token.slice(2, -2), k, renderCitation)}</s>);
    else if (m[4]) out.push(<em key={k}>{inline(token.slice(1, -1), k, renderCitation)}</em>);
    else if (m[6]) out.push(<Fragment key={k}>{renderCitation?.(Number(m[7])) ?? token}</Fragment>);
    else {
      const close = token.indexOf("](");
      const label = token.slice(1, close);
      const destination = token.slice(close + 2, -1);
      const href = webUrl(destination);
      const number = /^(\d{1,3})$/.exec(label)?.[1];
      const citation = number ? renderCitation?.(Number(number), destination) : null;
      out.push(
        citation ? <Fragment key={k}>{citation}</Fragment> : href ? (
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
  | { kind: "code"; text: string }
  | { kind: "hr" }
  | { kind: "table"; head: string[]; rows: string[][] };

export const VisibleMarkdownTables = createContext<ReadonlySet<string> | null>(null);

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
  return text.replace(/\s+/g, " ").trim();
}

/** A sentence-final citation can sit immediately before or after its period. */
function citationTextKey(text: string): string {
  return textKey(text).replace(/\s*(\[\d{1,2}\](?:\s*\[\d{1,2}\])*)\.$/, (_, citations: string) => ". " + citations);
}

type MarkdownMatches = {
  paragraphs: ReadonlySet<string>;
  titles: ReadonlySet<string>;
  code: ReadonlySet<string>;
  relationships: ReadonlySet<string>;
  tables: ReadonlySet<string>;
};

/** Match literal content only. Distinct wording and citation markers stay visible. */
export function nativeMarkdownMatches(root: unknown): MarkdownMatches {
  const paragraphs = new Set<string>();
  const titles = new Set<string>();
  const code = new Set<string>();
  const relationships = new Set<string>();
  const tables = new Set<string>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const node = value as { type?: string; typeName?: string; props?: Record<string, unknown> };
    if (node.type !== "element" || !node.props) {
      Object.values(value).forEach(visit);
      return;
    }
    const { props, typeName } = node;
    // The reverse of a study card is deliberately hidden until the user flips
    // it. A matching paragraph in the main answer must stay visible.
    if (typeName === "Flashcard") return;
    if (["Text", "Caption", "Quote"].includes(typeName ?? "") && typeof props.text === "string") paragraphs.add(citationTextKey(props.text));
    if (typeName === "Text" && Array.isArray(props.text)) {
      const parts = props.text.map(part => {
        if (typeof part === "string") return part;
        if (part?.type !== "element" || part.typeName !== "Source") return undefined;
        const number = /^source-(\d{1,2})$/.exec(part.props?.id ?? "")?.[1];
        return number === undefined ? undefined : `[${number}]`;
      });
      if (parts.every(part => part !== undefined)) paragraphs.add(citationTextKey(parts.join("")));
    }
    if (typeName === "Title" && typeof props.text === "string") titles.add(textKey(props.text));
    if (["Section", "Diagram", "Card"].includes(typeName ?? "") && typeof props.title === "string") titles.add(textKey(props.title));
    if (typeName === "Section" && typeof props.introduction === "string") paragraphs.add(citationTextKey(props.introduction));
    if (typeName === "Diagram" && Array.isArray(props.nodes) && Array.isArray(props.links)) {
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
    if (typeName === "Markdown" && typeof props.text === "string") {
      for (const block of blocks(props.text)) {
        if (block.kind === "p") paragraphs.add(citationTextKey(block.text));
        if (block.kind === "h") titles.add(textKey(block.text));
        if (block.kind === "code") code.add(block.text.trimEnd());
      }
    }
    if (typeName === "Table" && Array.isArray(props.columns) && Array.isArray(props.rows) && props.rows.every(Array.isArray)) {
      const key = tableContentKey(props.columns, props.rows);
      if (key) tables.add(key);
    }
    Object.values(props).forEach(visit);
  }
  visit(root);
  return { paragraphs, titles, code, tables, relationships };
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
    const fence = /^ {0,3}(\x60{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length; i++) {
        const close = /^ {0,3}(\x60{3,}|~{3,})[ \t]*$/.exec(lines[i])?.[1];
        if (close && close[0] === fence[0] && close.length >= fence.length) break;
        body.push(lines[i]);
      }
      out.push({ kind: "code", text: body.join("\n") });
      i++;
      continue;
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
      out.push({ kind: "quote", text: body.join(" ") });
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

export function MarkdownBlocks({ text, renderCitation, deduplicateTables = false, matches }: { text: string; renderCitation?: RenderCitation; deduplicateTables?: boolean; matches?: MarkdownMatches }) {
  const seenTables = new Set<string>();
  return (
    <>
      {blocks(text).map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case "p":
            if (matches?.paragraphs.has(citationTextKey(b.text))) return null;
            return <p key={k}>{inline(b.text, k, renderCitation)}</p>;
          case "quote":
            return <blockquote key={k}>{inline(b.text, k, renderCitation)}</blockquote>;
          case "h":
            if (matches?.titles.has(textKey(b.text))) return null;
            return (
              <div key={k} role="heading" aria-level={b.level + 1} className={`iui-md-h iui-md-h${b.level}`}>
                {inline(b.text, k, renderCitation)}
              </div>
            );
          case "code":
            if (matches?.code.has(b.text.trimEnd())) return null;
            return (
              <pre key={k} className="iui-code-block">
                <code>{b.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={k} className="iui-divider" />;
          case "list": {
            const entries = b.ordered ? b.items : b.items.filter(item => !matches?.relationships.has(textKey(item)));
            if (!entries.length) return null;
            const items = entries.map((item, j) => <li key={j}>{inline(item, `${k}-${j}`, renderCitation)}</li>);
            return b.ordered ? (
              <ol key={k} start={b.start}>
                {items}
              </ol>
            ) : (
              <ul key={k}>{items}</ul>
            );
          }
          case "table": {
            const tableKey = deduplicateTables || matches ? tableContentKey(b.head, b.rows) : undefined;
            if (tableKey && !tableHasLinks(b.head, b.rows) && (seenTables.has(tableKey) || matches?.tables.has(tableKey))) return null;
            if (tableKey) seenTables.add(tableKey);
            return (
              <div key={k} className={cx("iui-table-scroll", isLongAnswerTable(b.rows.length) && "iui-table-bounded")} role="region" aria-label="Answer table" tabIndex={0}>
                <table className="iui-table">
                  <thead>
                    <tr>{b.head.map((h, j) => <th key={j}>{inline(h, `${k}-h${j}`, renderCitation)}</th>)}</tr>
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
