"use client";

import { Check, Code2, Copy } from "lucide-react";
import React, { useEffect, useState, type CSSProperties } from "react";
import type { HighlightedToken } from "@/lib/codeHighlight";
import { isPresentationLanguage } from "@/lib/publicAnswerText";

const languageLabels: Record<string, string> = {
  py: "Python", python: "Python",
  js: "JavaScript", javascript: "JavaScript",
  ts: "TypeScript", typescript: "TypeScript",
  sh: "Shell", shell: "Shell", bash: "Bash",
  powershell: "PowerShell", ps1: "PowerShell",
  json: "JSON", sql: "SQL", html: "HTML", css: "CSS",
  md: "Markdown", markdown: "Markdown",
  text: "Plain text", plaintext: "Plain text", txt: "Plain text",
};

export function CodePanel({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const key = language?.toLowerCase() ?? "";
  const label = Object.hasOwn(languageLabels, key) ? languageLabels[key] : language || "Code";
  const copyLabel = label === "Plain text" ? "Copy text" : "Copy code";
  const internal = isPresentationLanguage(language);
  const [highlight, setHighlight] = useState<{ code: string; language?: string; lines: HighlightedToken[][] }>();
  useEffect(() => {
    if (!language || internal) return;
    let current = true;
    void import("@/lib/codeHighlight").then(module => module.highlightCode(code, language)).then(lines => {
      if (current && lines) setHighlight({ code, language, lines });
    }).catch(() => {});
    return () => { current = false; };
  }, [code, internal, language]);
  if (internal) return null;
  const colored = highlight?.code === code && highlight.language === language ? highlight.lines : undefined;
  const copy = () =>
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  return (
    <div className="iui-codeblock">
      <div className="iui-codeblock-head">
        <span className="iui-codeblock-language"><Code2 size={15} aria-hidden="true" />{label}</span>
        <button type="button" onClick={copy} aria-label={copyLabel}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : copyLabel}
        </button>
      </div>
      <pre tabIndex={0} role="group" aria-label="Code block">
        <code className={language && /^[\w+#.-]+$/.test(language) ? "language-" + language : undefined}>{colored ? colored.map((line, i) => (
          <span key={i}>{line.map((token, j) => <span key={j} className="iui-code-token" style={{
            "--iui-code-light": token.light, "--iui-code-dark": token.dark,
          } as CSSProperties}>{token.content}</span>)}{i < colored.length - 1 ? "\n" : null}</span>
        )) : code}</code>
      </pre>
    </div>
  );
}
