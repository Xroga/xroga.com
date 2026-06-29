'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const XTermTerminal = dynamic(() => import('./XTermPane').then((m) => m.XTermPane), {
  ssr: false,
  loading: () => <div className="h-48 bg-black/80 animate-pulse rounded-lg" />,
});

interface TerminalSplitViewProps {
  deployUrl?: string | null;
  className?: string;
}

export function TerminalSplitView({ deployUrl, className }: TerminalSplitViewProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      className={cn(
        'grid gap-2',
        fullscreen ? 'fixed inset-0 z-50 p-4 bg-black/95 grid-cols-1' : 'grid-cols-1 lg:grid-cols-2',
        className
      )}
    >
      <div className="relative rounded-lg border border-white/10 overflow-hidden min-h-[200px]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] border-b border-white/10 text-[10px]">
          <span className="font-mono text-white/70">xroga@swarm ~ shell</span>
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="text-white/50 hover:text-white"
          >
            {fullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
        <XTermTerminal />
      </div>
      {!fullscreen && (
        <div className="rounded-lg border border-white/10 overflow-hidden min-h-[200px] bg-white">
          <div className="px-3 py-1.5 bg-gray-100 border-b text-[10px] font-medium text-gray-600">
            Live preview
          </div>
          {deployUrl ? (
            <iframe src={deployUrl} title="Deploy preview" className="w-full h-[280px] border-0" />
          ) : (
            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
              Deploy a project to see live preview
            </div>
          )}
        </div>
      )}
    </div>
  );
}
