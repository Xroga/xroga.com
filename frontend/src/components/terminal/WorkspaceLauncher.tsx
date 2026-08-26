'use client';

import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { FilePenIcon } from '@/components/icons/animated/FilePenIcon';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

/**
 * Compact workspace and composer controls owned by the terminal title bar.
 *
 * Keeping them in the header prevents a detached toolbar row from floating between
 * the workspace content and the terminal window. The chat control stays icon-only;
 * Workspace remains labelled wherever the title bar has room.
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

      <button
        type="button"
        onClick={() => setWorkspaceOpen(!workspaceOpen)}
        className="xv-ws-launch"
        title={workspaceOpen ? 'Close project edits' : 'Open project edits'}
        aria-pressed={workspaceOpen}
      >
        {/* "Project edits" rather than "Workspace": the panel behind this button is the
            file tree, the diff and the editor, and the word Workspace already names the
            whole page in the sidebar and the bottom bar. Two different things called
            the same thing is one thing too many. The pen says what it opens; a pair of
            panel-slide glyphs said only that a panel would move. */}
        <AnimatedIcon icon={FilePenIcon} size={14} intro={false} />
        <span>Project edits</span>
      </button>
    </div>
  );
}
