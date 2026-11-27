"use client";

import { defineComponent } from "@openuidev/react-lang";
import { useContext } from "react";
import { z } from "zod/v4";
import { useRenderEvidenceCitation } from "../../evidence";
import { inline, tableContentKey, VisibleMarkdownTables } from "./markdown";
import { SortableTableView } from "./table-view";

const isElement = (value: unknown) => !!value && typeof value === "object" && (value as { type?: unknown }).type === "element";

export const Table = defineComponent({
  name: "Table",
  props: z.object({
    columns: z.array(z.string()).min(1).max(12),
    rows: z.array(z.array(z.any()).max(12)).max(120),
  }),
  description: "Each row lists its cells in column order; a cell may be a component. Number columns align right.",
  component: function SortableTable({ props, renderNode }) {
    const proseTables = useContext(VisibleMarkdownTables);
    const renderCitation = useRenderEvidenceCitation();
    const columns = Array.isArray(props.columns) ? props.columns.map((c) => String(c ?? "")) : [];
    const rows = (Array.isArray(props.rows) ? props.rows : []).filter(Array.isArray) as unknown[][];
    if (!columns.length || rows.some(row => row.length !== columns.length)) return <p>Table data is incomplete.</p>;
    const key = proseTables && tableContentKey(columns, rows);
    if (key && proseTables.has(key)) return null;
    const renderText = (value: string) => inline(value, "table-cell", renderCitation);
    return (
      <SortableTableView columns={columns} rows={rows} renderText={renderText}
        renderCell={(value) => isElement(value) ? renderNode(value) :
          typeof value === "number" ? value.toLocaleString("en-US", { maximumSignificantDigits: 17 }) :
            renderText(String(value ?? ""))} />
    );
  },
});
