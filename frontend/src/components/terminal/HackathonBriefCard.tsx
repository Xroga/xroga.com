'use client';

import { Calendar, ExternalLink, Trophy, Target, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HackathonBriefCardData {
  id: string;
  name: string;
  sponsor: string;
  deadline?: string;
  prizePool?: string;
  registrationUrl?: string;
  listingUrl?: string;
  productType: string;
  cryptoRequired: boolean;
  judgingCriteria: string[];
  prizeTracks: Array<{ name: string; prize: string; criteria: string }>;
  submissionSteps: Array<{ order: number; label: string; detail: string }>;
  sponsorGaps: string[];
  rejectReasons: string[];
  innovationSweetSpot: string;
  recommendedIdeas: Array<{
    name: string;
    tagline: string;
    targetTrack: string;
    whyNovel: string;
    sponsorGapFilled: string;
    demoStory90s: string;
  }>;
  recommendedIdea?: {
    name: string;
    tagline: string;
    targetTrack: string;
    whyNovel: string;
    sponsorGapFilled: string;
    demoStory90s: string;
  };
  sources?: Array<{ title: string; url: string; snippet: string }>;
}

function formatDeadline(iso?: string): string {
  if (!iso) return 'See official page';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

export function HackathonBriefCard({ brief }: { brief: HackathonBriefCardData }) {
  const topPick = brief.recommendedIdea ?? brief.recommendedIdeas[0];

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] to-orange-600/[0.04] overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-amber-500/20 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wide mb-1">
            <Trophy className="w-3.5 h-3.5" />
            Hackathon brief
          </div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] leading-snug">{brief.name}</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {brief.sponsor} · {brief.productType}
            {!brief.cryptoRequired && ' · crypto optional'}
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)] space-y-1">
          {brief.prizePool && <div className="font-medium text-amber-600 dark:text-amber-400">{brief.prizePool}</div>}
          <div className="flex items-center gap-1 justify-end">
            <Calendar className="w-3 h-3" />
            {formatDeadline(brief.deadline)}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4 text-sm">
        {topPick && (
          <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.05] p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Top pick → {topPick.targetTrack}
            </div>
            <div className="font-semibold text-[var(--foreground)]">{topPick.name}</div>
            <p className="text-xs text-[var(--muted)] mt-1">{topPick.tagline}</p>
            <p className="text-xs mt-2 text-[var(--foreground)]/85">
              <span className="font-medium">90s demo:</span> {topPick.demoStory90s}
            </p>
          </div>
        )}

        {brief.submissionSteps.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[var(--foreground)] mb-1.5 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-[var(--muted)]" />
              Submission checklist
            </div>
            <ol className="space-y-1.5 text-xs text-[var(--muted)]">
              {brief.submissionSteps.map((s) => (
                <li key={s.order} className="flex gap-2">
                  <span className="font-mono text-[var(--accent)] shrink-0">{s.order}.</span>
                  <span>
                    <span className="font-medium text-[var(--foreground)]">{s.label}</span> — {s.detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {brief.prizeTracks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[var(--foreground)] mb-1.5">Prize tracks</div>
            <div className="flex flex-wrap gap-1.5">
              {brief.prizeTracks.slice(0, 6).map((t) => (
                <span
                  key={t.name}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)]"
                  title={t.criteria}
                >
                  {t.name}
                </span>
              ))}
              {brief.prizeTracks.length > 6 && (
                <span className="text-[10px] px-2 py-0.5 text-[var(--muted)]">+{brief.prizeTracks.length - 6} more</span>
              )}
            </div>
          </div>
        )}

        {brief.sponsorGaps.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[var(--foreground)] mb-1">Sponsor gaps to fill</div>
            <ul className="text-xs text-[var(--muted)] space-y-0.5 list-disc pl-4">
              {brief.sponsorGaps.slice(0, 3).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        {brief.rejectReasons.length > 0 && (
          <div className="flex gap-2 text-xs text-[var(--muted)]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
            <p>
              <span className="font-medium text-[var(--foreground)]">Avoid rejection:</span>{' '}
              {brief.rejectReasons[0]}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {brief.registrationUrl && (
            <a
              href={brief.registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg',
                'border border-[var(--card-border)] hover:border-[var(--accent)]/50 transition-colors'
              )}
            >
              Official page <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {brief.listingUrl && (
            <a
              href={brief.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg',
                'border border-[var(--card-border)] hover:border-[var(--accent)]/50 transition-colors'
              )}
            >
              Marketplace <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
