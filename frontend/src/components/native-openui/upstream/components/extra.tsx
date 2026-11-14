"use client";

import { defineComponent } from "@openuidev/react-lang";
import katex from "katex";

import { Check, Copy } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { z } from "zod/v4";
import { inline } from "./markdown";
import type { HighlightedToken } from "@/lib/codeHighlight";
import { isPresentationLanguage } from "@/lib/publicAnswerText";
import { useRenderEvidenceCitation } from "../../evidence";
import { children, cx } from "./style";

const str = (value: unknown) => (value == null ? "" : String(value));
/** A slot that takes a component, a list of them, or plain text. */
const slot = z.union([z.string(), children]);
type Render = (value: unknown) => ReactNode;
const renderSlot = (value: unknown, renderNode: Render) =>
  typeof value === "string" || typeof value === "number" ? inline(String(value)) : renderNode(Array.isArray(value) ? value.flat() : value);

// Carousel
export const Carousel = defineComponent({
  name: "Carousel",
  props: z.object({ children, itemWidth: z.number().optional(), gap: z.number().optional() }),
  description: "Wrapping row of cards, options or days. Each item has a preferred width in CSS pixels.",
  component: function CarouselView({ props, renderNode }) {
    const items = (props.children ?? []).flat().filter(item => item != null);
    const width = Math.min(640, Math.max(80, props.itemWidth ?? 240));
    return <div className="iui-carousel-grid" style={{ gap: props.gap != null ? Math.max(0, props.gap) * 4 : undefined }}>
      {items.map((item, index) => <div key={index} style={{ flexBasis: width }}>{renderNode(item)}</div>)}
    </div>;
  },
});

// Popover content is part of the answer and remains visible inline.
export const Popover = defineComponent({
  name: "Popover",
  props: z.object({ trigger: slot, content: slot }),
  description: 'Inline note with a label and visible contents, for a definition or supporting detail.',
  component: ({ props, renderNode }) => <aside className="iui-inline-note">
    {renderSlot(props.trigger, renderNode)}
    <div className="iui-col iui-flow">{renderSlot(props.content, renderNode)}</div>
  </aside>,
});

// Code, quote, math
export const Code = defineComponent({
  name: "Code",
  props: z.object({ code: z.string(), language: z.string().optional() }),
  description: "Code block with a copy button.",
  component: function CodeView({ props }) {
    const [copied, setCopied] = useState(false);
    const code = str(props.code);
    const internal = isPresentationLanguage(props.language);
    const [highlight, setHighlight] = useState<{ code: string; lines: HighlightedToken[][] }>();
    useEffect(() => {
      if (!props.language || internal) return;
      let current = true;
      void import("@/lib/codeHighlight").then(module => module.highlightCode(code, props.language)).then(lines => {
        if (current && lines) setHighlight({ code, lines });
      }).catch(() => {});
      return () => { current = false; };
    }, [code, internal, props.language]);
    if (internal) return null;
    const colored = highlight?.code === code ? highlight.lines : undefined;
    const copy = () =>
      void navigator.clipboard?.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }).catch(() => {});
    return (
      <div className="iui-codeblock">
        <div className="iui-codeblock-head">
          <span>{str(props.language) || "code"}</span>
          <button type="button" onClick={copy} aria-label="Copy code">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre>
          <code>{colored ? colored.map((line, i) => (
            <span key={i}>{line.map((token, j) => <span key={j} className="iui-code-token" style={{
              "--iui-code-light": token.light, "--iui-code-dark": token.dark,
            } as CSSProperties}>{token.content}</span>)}{i < colored.length - 1 ? "\n" : null}</span>
          )) : code}</code>
        </pre>
      </div>
    );
  },
});

export const Quote = defineComponent({
  name: "Quote",
  props: z.object({ text: z.string(), cite: z.string().optional() }),
  description: "A quotation or a callout with a side rule; cite names the source.",
  component: function QuoteView({ props }) {
    const renderCitation = useRenderEvidenceCitation();
    return <blockquote className="iui-quote">
      <p>{inline(str(props.text), "quote", renderCitation)}</p>
      {props.cite ? <cite>{inline(str(props.cite), "attribution", renderCitation)}</cite> : null}
    </blockquote>;
  },
});

export const MathBlock = defineComponent({
  name: "Math",
  props: z.object({ tex: z.string(), inline: z.boolean().optional() }),
  description: 'LaTeX formula, e.g. Math("E = mc^2"); inline true to sit in a Text list.',
  component: ({ props }) => {
    const html = katex.renderToString(str(props.tex), { displayMode: !props.inline, throwOnError: false, maxExpand: 100, maxSize: 12, trust: false, strict: "ignore", output: "htmlAndMathml" });
    // KaTeX escapes its input and is configured without \href or \includegraphics.
    return props.inline ? <span className="iui-math" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="iui-math is-block" dangerouslySetInnerHTML={{ __html: html }} />;
  },
});

// Play
export const Flashcard = defineComponent({
  name: "Flashcard",
  props: z.object({ front: slot, back: slot, hint: z.string().optional() }),
  description: "Card that flips between front and back when tapped. Put several in a Carousel or Grid.",
  component: function FlashcardView({ props, renderNode }) {
    const [flipped, setFlipped] = useState(false);
    const face = (value: unknown) => (typeof value === "string" ? <span className="iui-flashcard-word">{inline(value)}</span> : renderSlot(value, renderNode));
    return (
      <button type="button" className={cx("iui-flashcard", flipped && "is-flipped")} aria-pressed={flipped} onClick={() => setFlipped(!flipped)}>
        <span className="iui-flashcard-inner">
          <span className="iui-flashcard-face is-front" aria-hidden={flipped}>
            {face(props.front)}
            <span className="iui-flashcard-hint">{str(props.hint) || "Tap to flip"}</span>
          </span>
          <span className="iui-flashcard-face is-back" aria-hidden={!flipped}>
            {face(props.back)}
          </span>
        </span>
      </button>
    );
  },
});
