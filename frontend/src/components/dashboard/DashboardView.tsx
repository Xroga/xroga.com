'use client';

import { SwarmMessageLog } from '@/components/terminal/SwarmMessageLog';
import { DevWorkspacePanel } from '@/components/terminal/DevWorkspacePanel';
import { TerminalSkinPicker } from '@/components/terminal/TerminalSkinPicker';
import { WorkspaceLauncher } from '@/components/terminal/WorkspaceLauncher';
import { ApiConnectionBanner } from '@/components/dashboard/ApiConnectionBanner';
import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { useAppStore } from '@/store/useAppStore';
import {
  useThemeStore,
  WORKSPACE_MAX_WIDTH,
  WORKSPACE_MIN_WIDTH,
} from '@/store/useThemeStore';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useShellIdentity } from '@/components/layout/ShellIdentityContext';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { TerminalPromptIcon } from '@/components/icons/animated/TerminalPromptIcon';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { ExpandIcon } from '@/components/icons/animated/ExpandIcon';
import { MinimizeIcon } from '@/components/icons/animated/MinimizeIcon';


/**
 * The workspace, as one desktop application window.
 *
 * It used to be two independent rounded cards sitting on a scrolling page — a terminal
 * card and, when opened, a workspace card beside it — which is why opening the workspace
 * read as "a second panel appeared" rather than "the window split". Worse, the page was
 * the scrolling surface, so a long transcript pushed the terminal card past the viewport
 * and the whole thing lost its inset and its rounded corners: it became a square.
 *
 * Now there is a single shell. One radius, one hairline border, one title bar, and two
 * internal panes divided by a hairline. The shell is exactly the height of its stage and
 * never scrolls; the terminal pane scrolls inside it, so the corners survive at every
 * scroll offset. Opening the workspace animates the body's grid columns rather than
 * mounting a card next to it.
 */
export function DashboardView() {
  const shellIdentity = useShellIdentity();
  const profile = useAppStore((s) => s.profile);
  const displayName = profile?.display_name ?? shellIdentity.displayName;
  const hydrated = useHydrated();
  const fullscreen = useThemeStore((s) => s.terminalFullscreen);
  const setTerminalFullscreen = useThemeStore((s) => s.setTerminalFullscreen);
  const workspaceOpenRaw = useProjectWorkspaceStore((s) => s.workspaceOpen);
  const workspaceOpen = hydrated && workspaceOpenRaw;
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const paneRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const workspaceWidth = useThemeStore((s) => s.workspaceWidth);
  const setWorkspaceWidth = useThemeStore((s) => s.setWorkspaceWidth);

  /**
   * Drag the split to any width.
   *
   * The width is stored as a share of the shell rather than in pixels, so the drag
   * converts the pointer's position into one: the panel's edge is wherever the
   * pointer is, expressed as the remaining fraction of the body. That keeps the split
   * where the user put it when the sidebar opens or the window resizes, which a pixel
   * width would not — it would keep its size and eat the terminal instead.
   *
   * Clamping lives in the store's setter, so the keyboard path below gets the same
   * bounds without repeating them.
   */
  function startWorkspaceResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const body = bodyRef.current;
    if (!body) return;
    document.body.classList.add('xv-workspace-resizing');

    function onMove(ev: PointerEvent) {
      const rect = body!.getBoundingClientRect();
      if (rect.width <= 0) return;
      setWorkspaceWidth(((rect.right - ev.clientX) / rect.width) * 100);
    }
    function onUp() {
      document.body.classList.remove('xv-workspace-resizing');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
    document.addEventListener('pointercancel', onUp, { once: true });
  }

  /* A separator that only responds to a pointer is unusable without one. Arrows move
     the split, Home and End take it to its bounds. */
  function onWorkspaceResizeKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 8 : 2;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setWorkspaceWidth(workspaceWidth + step);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setWorkspaceWidth(workspaceWidth - step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setWorkspaceWidth(WORKSPACE_MIN_WIDTH);
    } else if (e.key === 'End') {
      e.preventDefault();
      setWorkspaceWidth(WORKSPACE_MAX_WIDTH);
    }
  }
  /* The same source the terminal window has always used. `AppShell` keeps this in step
     with the page theme while the user is letting it track; deriving it from the theme
     here instead would silently override a skin the user picked by hand. */
  const terminalSkinRaw = useThemeStore((s) => s.terminalSkin);
  const skin = hydrated ? terminalSkinRaw : 'dark';

  useEffect(() => {
    document.body.classList.toggle('xv-terminal-fullscreen-active', fullscreen);
    return () => document.body.classList.remove('xv-terminal-fullscreen-active');
  }, [fullscreen]);

  useEffect(() => {
    useThemeStore.getState().setBrowserPanelOpen(false);
  }, []);

  /**
   * Keep the composer over the terminal pane, and only the terminal pane.
   *
   * The composer is fixed to the viewport — it has to be, so the software keyboard can
   * push it up — but it belongs to the terminal, not to the window. Measuring is not
   * laziness here: the split is a `1.4fr / minmax(360px, 1fr)` grid that animates, so
   * the pane's edge is a computed value that changes over 280ms. Re-deriving that in
   * CSS on a different element would be a second copy of the layout rule, free to
   * drift from the real one. This reads the edge that actually exists.
   */
  useEffect(() => {
    const pane = paneRef.current;
    const shell = shellRef.current;
    if (!pane || !shell) return;
    const root = document.documentElement;
    const sync = () => {
      // On a narrow screen an open workspace takes the whole shell and the terminal
      // pane is display:none — a zero-width rect. Falling back to the shell keeps the
      // composer spanning the window instead of collapsing to a sliver.
      const paneBox = pane.getBoundingClientRect();
      const box = paneBox.width > 0 ? paneBox : shell.getBoundingClientRect();
      root.style.setProperty('--xv-pane-left', `${Math.round(box.left)}px`);
      root.style.setProperty('--xv-pane-right', `${Math.round(window.innerWidth - box.right)}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(pane);
    observer.observe(shell);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      root.style.removeProperty('--xv-pane-left');
      root.style.removeProperty('--xv-pane-right');
    };
  }, [workspaceOpen, fullscreen]);

  /* The banner and the greeting live at the top of the transcript rather than above the
     shell. Anything placed outside would push the window down and shrink it on every
     render, and the greeting is transient content — it belongs where it can scroll away. */
  const terminalPane = (
    <div className="xv-terminal-scroll" data-testid="terminal-scroll">
      <ApiConnectionBanner />
      <DashboardWelcome displayName={displayName} hidden={fullscreen} />
      <SwarmMessageLog chromeless incognito={incognito} />
    </div>
  );

  return (
    <div className={cn('xv-app-stage', fullscreen && 'xv-app-stage--fullscreen')}>
      <div
        className={cn(
          'xv-workspace-shell',
          incognito ? 'terminal-skin-dark xv-workspace-shell--incognito' : `terminal-skin-${skin}`,
          !incognito && (skin === 'dark' || skin === 'amoled') && 'scanlines'
        )}
        data-testid="workspace-window"
        ref={shellRef}
      >
        {/* One continuous application toolbar. It sits outside the terminal's scroll
            container on purpose: a title bar that scrolls away with the history is a
            document header, not a window chrome. */}
        <header className="xv-workspace-header" data-testid="terminal-identity-header">
          <span className="xv-term-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>

          <div className="xv-term-title">
            {/* A live shell's cursor blinks whether or not anyone is pointing at it,
                so this one is not hover-driven — it runs continuously. */}
            <TerminalPromptIcon className="shrink-0 opacity-70" aria-hidden="true" />
            <h3>
              {incognito ? (
                'guest@incognito'
              ) : (
                <>
                  xroga<span className="xv-term-at">@</span>swarm
                </>
              )}
            </h3>
            <span className="xv-term-path">{incognito ? '~/temporary' : '~/workspace'}</span>
          </div>

          {incognito ? (
            <span className="xv-term-badge">Private · not saved</span>
          ) : (
            <div className="xv-workspace-header-tools">
              <WorkspaceLauncher />
              <span className="xv-header-sep" aria-hidden="true" />
              <TerminalSkinPicker />
              <button
                type="button"
                onClick={() => setTerminalFullscreen(!fullscreen)}
                className="xv-term-iconbtn"
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
                aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen terminal'}
              >
                {fullscreen ? (
                  <AnimatedIcon icon={MinimizeIcon} size={14} />
                ) : (
                  <AnimatedIcon icon={ExpandIcon} size={14} />
                )}
              </button>
            </div>
          )}
        </header>

        <div
          ref={bodyRef}
          className="xv-workspace-body"
          data-workspace-open={workspaceOpen ? 'true' : 'false'}
          style={{ '--xv-workspace-width': `${workspaceWidth}%` } as React.CSSProperties}
        >
          <div className="xv-terminal-panel" ref={paneRef}>
            {terminalPane}
          </div>
          {/* The split is draggable. Rendered only while the workspace is open, so a
              closed workspace has no invisible grab strip down the middle of the
              terminal. */}
          {workspaceOpen ? (
            <div
              role="separator"
              aria-label="Resize workspace panel"
              aria-orientation="vertical"
              aria-valuemin={WORKSPACE_MIN_WIDTH}
              aria-valuemax={WORKSPACE_MAX_WIDTH}
              aria-valuenow={Math.round(workspaceWidth)}
              tabIndex={0}
              className="xv-workspace-resize"
              onPointerDown={startWorkspaceResize}
              onKeyDown={onWorkspaceResizeKey}
            />
          ) : null}
          {/* Renders nothing while closed. The split itself is animated by the body's
              grid columns, so the terminal still widens and narrows smoothly whether or
              not the panel is in the tree. */}
          <DevWorkspacePanel flush />
        </div>
      </div>
    </div>
  );
}
