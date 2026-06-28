'use client';

import Link from 'next/link';
import {
  Users,
  Globe,
  Gamepad2,
  Box,
  Film,
  Heart,
  MessageSquare,
  Percent,
  Sparkles,
  Vote,
} from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

const FEATURES = [
  { icon: Globe, label: 'Websites, apps, games & software' },
  { icon: Box, label: 'Browser extensions, tools & 3D models' },
  { icon: Film, label: 'Videos, images & movie inspirations' },
  { icon: Heart, label: 'Help others & get inspired' },
  { icon: Vote, label: 'Vote & comment on creations' },
  { icon: MessageSquare, label: 'Connect with builders worldwide' },
];

export function CommunityComingSoon() {
  return (
    <PageFullscreenFrame>
      <div className="max-w-3xl mx-auto space-y-8 py-4">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Coming Soon
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold flex items-center justify-center gap-2">
            <Users className="w-8 h-8 text-[var(--accent)]" />
            Xroga Community
          </h1>
          <p className="text-sm text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
            Discover what other builders create — websites, apps, games, software, extensions, 3D models,
            videos, and images. Copy designs, vote, comment, and collaborate. A small platform fee supports
            Xroga while creators earn the rest.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-[var(--accent)]" /> What you&apos;ll get
          </h2>
          <ul className="grid sm:grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2 text-xs p-3 rounded-xl border border-[var(--card-border)] bg-white/[0.02]"
              >
                <Icon className="w-4 h-4 text-[var(--accent)] shrink-0" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="xv-uiverse-table-card max-w-md mx-auto">
          <div className="xv-uiverse-table-card__title">revenue share</div>
          <div className="xv-uiverse-table-card__data">
            <div className="xv-uiverse-table-card__right">
              <div className="xv-uiverse-table-card__item">xroga fee</div>
              <div className="xv-uiverse-table-card__item">creator share</div>
              <div className="xv-uiverse-table-card__item">copy design</div>
            </div>
            <div className="xv-uiverse-table-card__left">
              <div className="xv-uiverse-table-card__item">15%</div>
              <div className="xv-uiverse-table-card__item">85%</div>
              <div className="xv-uiverse-table-card__item">small fee</div>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-[var(--muted)] flex items-center justify-center gap-1">
          <Percent className="w-3 h-3" /> 15% supports Xroga AI · 85% goes to creators
        </p>

        <div className="text-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold hover:opacity-90"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
