'use client';

import { ExternalLink, GitBranch, CheckCircle2 } from 'lucide-react';

const BUILD_SUMMARY = [
  'GitHub linked — repository created',
  'XROGA Visionary clarified your project brief',
  'AI SWARM LOGIC approved the master plan',
  'XROGA Architect built & verified each step',
  'Code pushed to GitHub',
  'Live preview deployed',
] as const;

function deployHostLabel(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('vercel')) return 'Vercel';
    if (host.includes('netlify')) return 'Netlify';
    return 'Live host';
  } catch {
    return 'Live host';
  }
}

export interface LandingPageOutputData {
  type: 'landing_page';
  html: string;
  css: string;
  js: string;
  heroImageUrl?: string;
  deployUrl: string;
  githubRepoUrl?: string;
  githubRepoName?: string;
}

export function LandingPageCard({ data }: { data: LandingPageOutputData }) {
  const hostLabel = deployHostLabel(data.deployUrl);

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-emerald-400">🎉 Build complete — your site is live</p>
        {data.githubRepoName && (
          <span className="text-[9px] text-[var(--muted)] font-mono truncate">{data.githubRepoName}</span>
        )}
      </div>

      <div className="px-3 py-2.5 border-b border-white/10 bg-black/10">
        <p className="text-[10px] font-semibold text-[var(--foreground)]/80 mb-1.5">What XROGA completed</p>
        <ul className="space-y-1">
          {BUILD_SUMMARY.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-[9px] text-[var(--muted)] leading-snug">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <iframe
        src={data.deployUrl}
        title="Live preview"
        className="w-full h-[min(320px,50vh)] border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
      <div className="p-3 flex flex-wrap gap-2">
        <a
          href={data.deployUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#006aff]/25 text-[#93c5fd] text-xs font-semibold hover:bg-[#006aff]/35 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Preview
          <span className="text-[9px] font-normal opacity-75">({hostLabel})</span>
        </a>
        {data.githubRepoUrl && (
          <a
            href={data.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-[var(--foreground)]/80 text-xs font-medium hover:bg-white/10 transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            View on GitHub
          </a>
        )}
      </div>
    </div>
  );
}
