'use client';

import { ExternalLink, GitBranch, CheckCircle2 } from 'lucide-react';

function deployHostLabel(url: string): string {
  if (!url?.trim()) return 'Preview pending';
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
  projectName?: string;
  pages?: string[];
  features?: string[];
  designTheme?: string;
  needsPayment?: boolean;
  memoryNote?: string;
  summary?: string;
}

export function LandingPageCard({ data }: { data: LandingPageOutputData }) {
  const hasLiveUrl = Boolean(data.deployUrl?.trim());
  const hostLabel = deployHostLabel(data.deployUrl);
  const projectName = data.projectName ?? data.githubRepoName?.replace(/^xroga-/, '') ?? 'Your Website';
  const pages = data.pages ?? ['Home', 'Menu', 'Gallery', 'Contact'];
  const features = data.features ?? ['Responsive design', data.designTheme ?? 'Modern theme'];
  const designTheme = data.designTheme ?? 'Modern, clean design';

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] overflow-hidden">
      <div className="px-3 py-2.5 border-b border-white/10 bg-emerald-500/10">
        <p className="text-sm font-bold text-emerald-400">🎉 YOUR PROJECT IS LIVE!</p>
      </div>

      <div className="px-3 py-3 border-b border-white/10 bg-black/10">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]/70 mb-2">
          📌 Summary
        </p>
        <ul className="space-y-1.5 text-[11px] text-[var(--foreground)]/85">
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Name:</span>
            <span className="font-medium">{projectName}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Pages:</span>
            <span>{pages.join(', ')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Features:</span>
            <span>{features.join(', ')}</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[var(--muted)] shrink-0">Design:</span>
            <span>{designTheme}</span>
          </li>
        </ul>
        {data.memoryNote && (
          <p className="mt-2.5 text-[10px] text-[#93c5fd]/80 leading-snug border-t border-white/8 pt-2">
            💬 {data.memoryNote}
          </p>
        )}
      </div>

      {hasLiveUrl ? (
        <iframe
          src={data.deployUrl}
          title="Live preview"
          className="w-full h-[min(280px,45vh)] border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        <div className="w-full h-[min(160px,35vh)] flex items-center justify-center bg-black/20 text-[11px] text-[var(--muted)]">
          Live preview URL pending — check GitHub repo below.
        </div>
      )}

      <div className="p-3 flex flex-col gap-2">
        {hasLiveUrl && (
          <a
            href={data.deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-[#006aff] text-white text-sm font-bold hover:bg-[#0056d6] transition-colors shadow-lg shadow-[#006aff]/25"
          >
            <ExternalLink className="w-4 h-4" />
            🔗 Open Live Preview
            <span className="text-[10px] font-normal opacity-80">({hostLabel})</span>
          </a>
        )}
        {data.githubRepoUrl && (
          <a
            href={data.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-white/5 text-[var(--foreground)]/80 text-xs font-medium hover:bg-white/10 transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            📂 View Files on GitHub
          </a>
        )}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {['Homepage', 'Menu', data.needsPayment !== false ? 'Ordering' : null, 'Gallery', 'Contact', 'Responsive']
            .filter(Boolean)
            .map((step) => (
              <li key={step} className="flex items-center gap-1 text-[9px] text-emerald-400/90">
                <CheckCircle2 className="w-3 h-3" />
                {step}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
