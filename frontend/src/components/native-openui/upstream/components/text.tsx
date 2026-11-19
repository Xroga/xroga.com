"use client";

import { defineComponent } from "@openuidev/react-lang";
import { isElementNode } from "@openuidev/lang-core";
import { ArrowUpRight } from "lucide-react";
import { Fragment, useContext } from "react";
import { z } from "zod/v4";
import { Glyph } from "./glyph";
import { inline, MarkdownBlocks, NativeVisualContent } from "./markdown";
import { EvidenceContext, evidenceSource, useRenderEvidenceCitation } from '../../evidence';
import { children, color, cx, fg, webUrl } from "./style";

const str = (value: unknown) => (value == null ? "" : String(value));

export const Title = defineComponent({
  name: "Title",
  props: z.object({
    text: z.string(),
    size: z.enum(["sm", "md", "lg", "xl", "2xl", "3xl"]).optional(),
    color: color.optional(),
    level: z.enum(["2", "3", "4"]).optional(),
  }),
  description: "Heading. Size is visual; level is 2 by default, 3 for subsections and 4 only within a subsection.",
  component: function NativeTitle({ props }) {
    const renderCitation = useRenderEvidenceCitation();
    const sizeName = props.size ?? "md";
    return (
      <div role="heading" aria-level={Number(props.level ?? "2")} className={`iui-title iui-title-${sizeName}`} style={{ color: fg(props.color) }}>
        {inline(str(props.text), "title", renderCitation)}
      </div>
    );
  },
});

/** Text, or a run of strings and inline components such as Icon, Badge, Link or Math. */
const richText = z.union([z.string(), children]);

export const Text = defineComponent({
  name: "Text",
  props: z.object({
    text: richText,
    size: z.enum(["xs", "sm", "md", "lg"]).optional(),
    color: color.optional(),
    weight: z.enum(["normal", "medium", "semibold"]).optional(),
    italic: z.boolean().optional(),
    lineThrough: z.boolean().optional(),
    tabularNums: z.boolean().optional(),
    maxLines: z.number().optional(),
  }),
  description: "Paragraph with bold, italic and code. Inline components can include Source, Icon, or Badge. Only use verified Source IDs for links.",
  component: function NativeText({ props, renderNode }) {
    const renderCitation = useRenderEvidenceCitation();
    const evidence = useContext(EvidenceContext);
    const cluster = new Set<string>();
    return (
      <p
        className={cx("iui-text", props.size && `iui-text-${props.size}`, props.weight && `iui-weight-${props.weight}`)}
        style={{
          color: fg(props.color),
          fontStyle: props.italic ? "italic" : undefined,
          textDecoration: props.lineThrough ? "line-through" : undefined,
          fontVariantNumeric: props.tabularNums ? "tabular-nums" : undefined,
        }}
      >
        {Array.isArray(props.text)
          ? (props.text as unknown[]).flat().map((part, i) => {
              if (!isElementNode(part)) return <Fragment key={i}>{inline(str(part), `t${i}`, renderCitation, cluster)}</Fragment>;
              if (part.typeName === 'Source' && typeof part.props.id === 'string') {
                const citation = evidenceSource(evidence, part.props.id, cluster);
                if (citation === null) cluster.clear();
                return citation && <span key={i} className="iui-inline">{citation}</span>;
              }
              cluster.clear();
              return <span key={i} className="iui-inline">{renderNode(part)}</span>;
            })
          : inline(str(props.text), 'text', renderCitation, cluster)}
      </p>
    );
  },
});

export const Caption = defineComponent({
  name: "Caption",
  props: z.object({ text: z.string(), color: color.optional() }),
  description: "Small secondary text.",
  component: function CaptionView({ props }) {
    const renderCitation = useRenderEvidenceCitation();
    return <p className="iui-caption" style={{ color: fg(props.color) }}>
      {inline(str(props.text), "caption", renderCitation)}
    </p>;
  },
});

export const Label = defineComponent({
  name: "Label",
  props: z.object({ text: z.string() }),
  description: "Field or group label.",
  component: ({ props }) => <span className="iui-label">{str(props.text)}</span>,
});

export const Badge = defineComponent({
  name: "Badge",
  props: z.object({
    text: z.string(),
    color: z.enum(["neutral", "info", "success", "warning", "danger", "purple", "pink"]).optional(),
    icon: z.string().optional(),
  }),
  description: "Pill tag; icon is an optional leading lucide name.",
  component: ({ props }) => (
    <span className={`iui-badge iui-badge-${props.color ?? "neutral"}`}>
      {props.icon ? <Glyph name={props.icon} size={14} /> : null}
      {str(props.text)}
    </span>
  ),
});

export const Link = defineComponent({
  name: "Link",
  props: z.object({ text: z.string(), url: z.string() }),
  description: "Opens an http(s) URL in a new tab.",
  component: ({ props }) => {
    const href = webUrl(props.url);
    if (!href) return <span>{str(props.text)}</span>;
    return (
      <a className="iui-link" href={href} target="_blank" rel="noopener noreferrer">
        {str(props.text) || new URL(href).hostname}
        <ArrowUpRight aria-hidden className="iui-link-arrow" />
      </a>
    );
  },
});

type ItemElement = { type: "element"; typeName: string; props: Record<string, unknown> };
const isItem = (value: unknown): value is ItemElement =>
  !!value && typeof value === "object" && (value as ItemElement).type === "element" && (value as ItemElement).typeName === "ListItem";

export const ListItem = defineComponent({
  name: "ListItem",
  props: z.object({
    title: z.string(),
    description: z.string().optional(),
    marker: z.string().optional(),
    children: children.optional(),
  }),
  description: "marker replaces the bullet or number, e.g. a time or an emoji.",
  // Rendered by List; on its own it shows its content.
  component: function NativeListItem({ props, renderNode }) {
    const renderCitation = useRenderEvidenceCitation();
    return (
      <div className="iui-list-body">
        <div className="iui-list-title">{inline(str(props.title), "list-title", renderCitation)}</div>
        {props.description ? <div className="iui-list-description">{inline(str(props.description), "list-description", renderCitation)}</div> : null}
        {props.children ? <div className="iui-list-children">{renderNode(props.children)}</div> : null}
      </div>
    );
  },
});

export const List = defineComponent({
  name: "List",
  props: z.object({
    items: z.array(z.union([z.string(), ListItem.ref])),
    marker: z.enum(["bullet", "number", "none", "timeline"]).optional(),
    timeline: z.boolean().optional(),
  }),
  description: "timeline joins the markers with a line. The timeline marker is shorthand for a numbered timeline.",
  component: function NativeList({ props, renderNode }) {
    const renderCitation = useRenderEvidenceCitation();
    const items = (Array.isArray(props.items) ? props.items.flat() : []) as unknown[];
    const marker = props.marker === "timeline" ? "number" : (props.marker ?? "bullet");
    const timeline = props.timeline || props.marker === "timeline";
    const textMarkers = items.some((item) => isItem(item) && typeof item.props.marker === "string" && item.props.marker.length > 2);
    const Tag = marker === "number" ? "ol" : "ul";
    return (
      <Tag className={cx("iui-list", `iui-list-${marker}`, timeline && "iui-timeline", textMarkers && "iui-list-wide")}>
        {items.map((item, i) => {
          if (item == null) return null;
          const custom = isItem(item) && typeof item.props.marker === "string" && item.props.marker ? item.props.marker : null;
          const step = !!custom && /^[0-9A-Za-z]{1,2}$/.test(custom);
          const rich = isItem(item) && (!!item.props.description || !!item.props.children);
          return (
            <li key={i} className={cx(rich && "iui-list-rich")}>
              <span className={cx("iui-list-marker", custom && (step ? "iui-list-marker-chip" : "iui-list-marker-text"))} aria-hidden={!custom}>
                {step ? <span>{custom}</span> : custom ?? (marker === "number" ? i + 1 : null)}
              </span>
              {isItem(item) ? renderNode(item) : <div className="iui-list-body">{inline(str(item), "list-text", renderCitation)}</div>}
            </li>
          );
        })}
      </Tag>
    );
  },
});

export const Markdown = defineComponent({
  name: "Markdown",
  props: z.object({ text: z.string() }),
  description: "Prose with headings, lists, quotes, code and tables.",
  component: function NativeMarkdown({ props }) {
    const renderCitation = useRenderEvidenceCitation();
    const nativeVisuals = useContext(NativeVisualContent);
    return <div className="iui-markdown"><MarkdownBlocks text={str(props.text)} renderCitation={renderCitation} nativeTables={nativeVisuals?.tables} nativeSectionTables={nativeVisuals?.sectionTables} nativeHeadingTitles={nativeVisuals?.headingTitles} nativeChecklists={nativeVisuals?.checklists} /></div>;
  },
});
