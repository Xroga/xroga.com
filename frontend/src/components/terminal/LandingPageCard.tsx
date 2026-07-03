'use client';

import { ExternalLink, GitBranch } from 'lucide-react';

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
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-emerald-400">🎉 Your project is live</p>
        {data.githubRepoName && (
          <span className="text-[9px] text-[var(--muted)] font-mono truncate">{data.githubRepoName}</span>
        )}
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
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#006aff]/20 text-[#93c5fd] text-xs font-medium hover:bg-[#006aff]/30 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open live preview
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
