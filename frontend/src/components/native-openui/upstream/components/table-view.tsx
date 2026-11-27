"use client";

import React, { useState, type ReactNode } from "react";
import { cx, isLongAnswerTable } from "./style";

const NUMERIC = /^([-+−]?)[$€£¥₹]?\s?(\d+(?:,\d{3})*(?:\.\d+)?)\s?(%|k|m|b|bn)?$/i;
const MAGNITUDE: Record<string, number> = { "%": 0.01, k: 1e3, m: 1e6, b: 1e9, bn: 1e9 };

export function tableCellText(cell: unknown): string {
  return String(cell ?? "").split(/(`[^`\n]+`)/g)
    .map((part, index) => index % 2 ? part.slice(1, -1) : part.replace(/\[(\d{1,3})\](?:\([^)\s]+\))?/g, ""))
    .join("").trim();
}

export const tableCellHasLinks = (cell: string) => /\[\d{1,3}\]|\]\(/.test(cell);
export const isLongAnswerTableCell = (cell: unknown) =>
  typeof cell === 'string' && cell.length >= 72 && tableCellText(cell).length >= 72;

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return;
  const match = NUMERIC.exec(tableCellText(value));
  if (!match) return;
  const [, sign, digits, suffix] = match;
  const amount = Number(digits.replaceAll(",", "")) * (MAGNITUDE[suffix?.toLowerCase() ?? ""] ?? 1);
  if (Number.isFinite(amount)) return sign === "-" || sign === "−" ? -amount : amount;
}

function isNumericColumn(rows: readonly unknown[][], column: number): boolean {
  const cells = rows.map(row => row[column]).filter(value => !/^(?:n\/a|\u2014|\u2013|-)?$/i.test(tableCellText(value)));
  return cells.length > 0 && cells.every(value => numericValue(value) !== undefined);
}

export function sortAnswerTableRows(rows: readonly unknown[][], column: number, descending: boolean, numeric: boolean): number[] {
  return rows.map((_, index) => index).sort((left, right) => {
    const a = rows[left][column], b = rows[right][column];
    if (numeric) {
      const leftNumber = numericValue(a), rightNumber = numericValue(b);
      if (leftNumber === undefined || rightNumber === undefined) {
        return Number(leftNumber === undefined) - Number(rightNumber === undefined);
      }
      return descending ? rightNumber - leftNumber : leftNumber - rightNumber;
    }
    const order = tableCellText(a).localeCompare(tableCellText(b), undefined, { numeric: true });
    return descending ? -order : order;
  });
}

export function SortableTableView({ columns, rows, renderText, renderCell }: {
  columns: readonly string[];
  rows: readonly unknown[][];
  renderText: (value: string) => ReactNode;
  renderCell?: (value: unknown) => ReactNode;
}) {
  const [sort, setSort] = useState<{ column: number; descending: boolean }>();
  const numeric = columns.map((_, column) => isNumericColumn(rows, column));
  const order = sort ? sortAnswerTableRows(rows, sort.column, sort.descending, numeric[sort.column]) : rows.map((_, index) => index);
  return (
    <div className={cx("iui-table-scroll", isLongAnswerTable(rows.length) && "iui-table-bounded")} role="region" aria-label="Answer table" tabIndex={0}>
      <table className="iui-table">
        <thead>
          <tr>
            {columns.map((column, i) => {
              if (!column.trim()) return <td key={i} />;
              const linked = tableCellHasLinks(column);
              const label = renderText(column);
              // Source links keep their own keyboard targets, separate from sorting.
              const sortLabel = linked ? tableCellText(column).replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1").trim() : "";
              return (
                <th key={i} scope="col" className={cx(numeric[i] && "is-numeric")} aria-sort={sort?.column === i ? sort.descending ? "descending" : "ascending" : undefined}>
                  {linked && <>{label} </>}
                  <button type="button" aria-label={linked ? `Sort by ${sortLabel || `column ${i + 1}`}` : undefined}
                    onClick={() => setSort({ column: i, descending: sort?.column === i && !sort.descending })}>{linked ? "Sort" : label}</button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {order.map(index => (
            <tr key={index}>
              {columns.map((_, column) => (
                <td key={column} className={cx(numeric[column] && "is-numeric")}
                  data-answer-table-long-text={isLongAnswerTableCell(rows[index][column]) ? '' : undefined}>
                  {renderCell ? renderCell(rows[index][column]) : renderText(String(rows[index][column] ?? ""))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
