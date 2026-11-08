"use client";

import { defineComponent } from "@openuidev/react-lang";
import { useState } from "react";
import { CellV2 } from "../../response-experience-v2/DataV2";
import { tableProps } from "../componentSchemas";

const NUMERIC = /^[-+−]?[$€£¥₹]?\s?\d[\d,]*(\.\d+)?\s?(%|[kKmMbB]|bn)?$/;

export const Table = defineComponent({
  name: "Table",
  props: tableProps,
  description: "Compare values in columns and rows. Use source data and put units in column names.",
  component: function TableView({ props }) {
    const { columns, rows, title } = props;
    const [sort, setSort] = useState<{ column: number; descending: boolean }>();
    // A column of numbers (or amounts like "$1.2k" and "45%") aligns right.
    const numeric = columns.map((_, c) => {
      const cells = rows.map((r) => r[c]).filter((v) => v != null && v !== "" && !(typeof v === "string" && /^(n\/a|\u2014|\u2013|-)$/i.test(v.trim())));
      return cells.length > 0 && cells.every((v) => typeof v === "number" || (typeof v === "string" && NUMERIC.test(v.trim())));
    });
    const orderedRows = sort ? [...rows].sort((left, right) => {
      const a = left[sort.column];
      const b = right[sort.column];
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
      return sort.descending ? -comparison : comparison;
    }) : rows;
    return (
      <div className="iui-table-scroll" tabIndex={0} role="region" aria-label={title || "Response data"}>
        <table className="iui-table">
          {title && <caption>{title}</caption>}
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col" className={numeric[i] ? "is-numeric" : undefined}
                  aria-sort={sort?.column === i ? sort.descending ? "descending" : "ascending" : undefined}>
                  <button type="button" onClick={() => setSort({ column: i, descending: sort?.column === i && !sort.descending })}>{c}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orderedRows.map((row, r) => (
              <tr key={r}>
                {columns.map((_, c) => (
                  <td key={c} className={numeric[c] ? "is-numeric" : undefined}>
                    <CellV2 value={row[c]} resourceLabel={c === 0} />
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
