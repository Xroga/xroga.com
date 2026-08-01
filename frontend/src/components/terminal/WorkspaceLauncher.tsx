'use client';

import { PanelRightOpen, PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

/**
 * The toolbar that sits above the terminal, aligned to its right edge.
 *
 * This replaces a pill fixed to the middle of the viewport's right edge. Fixing it
 * there meant it floated over whatever the user was reading, sat nowhere near the
 * thing it opens, and on narrow screens overlapped the content entirely. It is a
 * normal button in the flow now — right-aligned so it reads as belonging to the
 * terminal below it, with a labelled icon rather than bare rotated text.
 */
export function WorkspaceLauncher({ className }: { className?: string }) {
  const workspaceOpen = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const setWorkspaceOpen = useProjectWorkspaceStore((s) => s.setWorkspaceOpen);
  const chatbarHidden = useThemeStore((s) => s.chatbarHidden);
  const setChatbarHidden = useThemeStore((s) => s.setChatbarHidden);

  return (
    <div className={cn('flex items-center justify-end gap-1.5', className)}>
      {/* Deliberately icon-only and small: this is a get-out-of-the-way control, and
          a full label would compete with the workspace button next to it. The label
          still reaches assistive technology and hover. */}
      <button
        type="button"
        onClick={() => setChatbarHidden(!chatbarHidden)}
        className="xv-ws-launch xv-ws-launch--icon"
        aria-pressed={chatbarHidden}
        title={chatbarHidden ? 'Show the chatbar' : 'Hide the chatbar'}
        aria-label={chatbarHidden ? 'Show the chatbar' : 'Hide the chatbar'}
      >
        {chatbarHidden ? (
          <PanelBottomOpen className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <PanelBottomClose className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {!workspaceOpen && (
        <button
          type="button"
          onClick={() => setWorkspaceOpen(true)}
          className="xv-ws-launch"
          title="Open the project workspace"
        >
          <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Workspace</span>
        </button>
      )}
    </div>
  );
}
