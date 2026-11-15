"use client";

import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { useContext, useState } from "react";
import { inline, tableContentKey, VisibleMarkdownTables } from "./markdown";
import { cx, isLongAnswerTable } from "./style";

const NUMERIC = /^([-+−]?)[$€£¥₹]?\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?(%|k|m|b|bn)?$/i;
const MAGNITUDE: Record<string, number> = { "%": 0.01, k: 1e3, m: 1e6, b: 1e9, bn: 1e9 };
const isElement = (value: unknown) => !!value && typeof value === "object" && (value as { type?: unknown }).type === "element";

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return;
  const match = NUMERIC.exec(value.trim());
  if (!match) return;
  const [, sign, digits, suffix] = match;
  const amount = Number(digits.replaceAll(",", "")) * (MAGNITUDE[suffix?.toLowerCase() ?? ""] ?? 1);
  if (Number.isFinite(amount)) return sign === "-" || sign === "−" ? -amount : amount;
}

export const Table = defineComponent({
  name: "Table",
  props: z.object({
    columns: z.array(z.string()).min(1).max(12),
    rows: z.array(z.array(z.any()).max(12)).max(120),
  }),
  description: "Each row lists its cells in column order; a cell may be a component. Number columns align right.",
  component: function SortableTable({ props, renderNode }) {
    const [sort, setSort] = useState<{ column: number; descending: boolean }>();
    const proseTables = useContext(VisibleMarkdownTables);
    const columns = Array.isArray(props.columns) ? props.columns.map((c) => String(c ?? "")) : [];
    const rows = (Array.isArray(props.rows) ? props.rows : []).filter(Array.isArray) as unknown[][];
    if (!columns.length || rows.some(row => row.length !== columns.length)) return <p>Table data is incomplete.</p>;
    const key = proseTables && tableContentKey(columns, rows);
    if (key && proseTables.has(key)) return null;
    // A column of numbers (or amounts like "$1.2k" and "45%") aligns right.
    const numeric = columns.map((_, c) => {
      const cells = rows.map((r) => r[c]).filter((v) => v != null && v !== "" && !(typeof v === "string" && /^(n\/a|\u2014|\u2013|-)$/i.test(v.trim())));
      return cells.length > 0 && cells.every((v) => numericValue(v) !== undefined);
    });
    const visibleRows = sort ? [...rows].sort((left, right) => {
      const a = left[sort.column], b = right[sort.column];
      if (numeric[sort.column]) {
        const leftNumber = numericValue(a), rightNumber = numericValue(b);
        if (leftNumber === undefined || rightNumber === undefined) {
          return Number(leftNumber === undefined) - Number(rightNumber === undefined);
        }
        return sort.descending ? rightNumber - leftNumber : leftNumber - rightNumber;
      }
      const order = String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
      return sort.descending ? -order : order;
    }) : rows;
    const cell = (value: unknown) =>
      isElement(value) ? renderNode(value) : typeof value === "number" ? value.toLocaleString("en-US", { maximumSignificantDigits: 17 }) : inline(String(value ?? ""));
    return (
      <div className={cx("iui-table-scroll", isLongAnswerTable(rows.length) && "iui-table-bounded")} role="region" aria-label="Answer table" tabIndex={0}>
        <table className="iui-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col" className={cx(numeric[i] && "is-numeric")} aria-sort={sort?.column === i ? sort.descending ? "descending" : "ascending" : undefined}>
                  <button type="button" onClick={() => setSort({ column: i, descending: sort?.column === i && !sort.descending })}>{c}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, r) => (
              <tr key={r}>
                {columns.map((_, c) => (
                  <td key={c} className={cx(numeric[c] && "is-numeric")}>
                    {cell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});
