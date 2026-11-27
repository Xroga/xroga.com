"use client";

import { Check, Code2, Copy } from "lucide-react";
import React, { useEffect, useState, type CSSProperties } from "react";
import type { HighlightedToken } from "@/lib/codeHighlight";
import { copyTextToClipboard } from "@/lib/clipboard";
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
  const [copyResult, setCopyResult] = useState<{ code: string; copied: boolean }>();
  const copyStatus = copyResult?.code === code ? copyResult.copied ? "copied" : "failed" : "idle";
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
  useEffect(() => {
    if (!copyResult?.copied) return;
    const timer = window.setTimeout(() => setCopyResult(undefined), 1500);
    return () => window.clearTimeout(timer);
  }, [copyResult]);
  if (internal) return null;
  const colored = highlight?.code === code && highlight.language === language ? highlight.lines : undefined;
  const copy = async () => setCopyResult({ code, copied: await copyTextToClipboard(code) });
  return (
    <div className="iui-codeblock">
      <div className="iui-codeblock-head">
        <span className="iui-codeblock-language"><Code2 size={15} aria-hidden="true" />{label}</span>
        <button type="button" onClick={() => void copy()} aria-label={copyLabel}>
          {copyStatus === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span aria-live="polite">{copyStatus === "copied" ? "Copied" : copyLabel}</span>
        </button>
      </div>
      {copyStatus === "failed" && <p className="px-3 text-sm" role="status">Could not copy. Select the text to copy it manually.</p>}
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
