'use client';

import { useState } from 'react';
import { SwarmRunHistory } from '@/components/dashboard/SwarmRunHistory';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { MessageSquare } from 'lucide-react';

export default function ChatsPage() {
  const [query, setQuery] = useState('');

  return (
    <PageFullscreenFrame>
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-[var(--accent)]" />
          Chats & Reports
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Conversations, reports, research, documents, and swarm history — continue any task from here.
        </p>
      </div>
      <SectionSearchBar value={query} onChange={setQuery} placeholder="Search chats & research…" />
      <div className="glass-panel rounded-2xl overflow-hidden">
        <SwarmRunHistory search={query} />
      </div>
    </div>
    </PageFullscreenFrame>
  );
}
