'use client';

/**
 * Smoky, the Xroga companion.
 *
 * Smoky reacts to real operation state, and clicking opens usage.
 *
 * The voice is still gone and is not coming back — unprompted speech over a work
 * surface was the intrusive part. The old click panel is also not restored: that
 * carried voice toggles, a status readout, dictation and a feed control. This opens
 * one thing, current capacity, which is worth a click and cannot talk over you.
 *
 * Because it is interactive again it is a real button: focusable, labelled, and
 * keyboard operable. It was `aria-hidden` only while it was purely decorative.
 *
 * Companion preferences (skin, accent, size, dock, visibility) live in
 * Settings → Companion. Mic dictation belongs to the composer, not here.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { CompanionRenderer } from './CompanionRenderer';
import { CompanionUsagePopover } from './CompanionUsagePopover';

import { useCompanionStore } from '@/store/useCompanionStore';
import { cn } from '@/lib/utils';

export interface XrogaCompanionProps {
  variant?: 'hero' | 'composer' | 'floating' | 'preview';
  className?: string;
}

const USAGE_HOVER_CLOSE_DELAY_MS = 140;

export function XrogaCompanion({
  variant = 'floating',
  className,
}: XrogaCompanionProps) {
  const introShown = useRef(false);

  const rootRef = useRef<HTMLDivElement>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);

  const usageCloseTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const [usageOpen, setUsageOpen] = useState(false);

  const [usageStyle, setUsageStyle] =
    useState<React.CSSProperties>({});

  const [intro, setIntro] = useState(false);

  const state = useCompanionStore();

  const operation = state.operation;

  /**
   * Cancel a pending hover-close.
   *
   * This is important when the pointer leaves Smoky and travels
   * into the usage card. Without the small grace period, the card
   * disappears before the pointer can reach it.
   */
  function cancelUsageClose() {
    if (usageCloseTimerRef.current === null) {
      return;
    }

    clearTimeout(usageCloseTimerRef.current);

    usageCloseTimerRef.current = null;
  }

  /**
   * Open the usage card and cancel any close that may already
   * have been scheduled.
   */
  function openUsage() {
    cancelUsageClose();

    setUsageOpen(true);
  }

  /**
   * Close shortly after the pointer leaves.
   *
   * The delay lets the pointer travel between Smoky and the
   * portalled usage card without causing flicker.
   */
  function scheduleUsageClose() {
    cancelUsageClose();

    usageCloseTimerRef.current = setTimeout(() => {
      usageCloseTimerRef.current = null;

      setUsageOpen(false);
    }, USAGE_HOVER_CLOSE_DELAY_MS);
  }

  /**
   * Explicit close used by the X button.
   */
  function closeUsage() {
    cancelUsageClose();

    setUsageOpen(false);
  }

  /**
   * One-per-session entrance so Smoky does not re-animate on
   * every navigation.
   */
  useEffect(() => {
    if (introShown.current) {
      return;
    }

    introShown.current = true;

    const key = 'xroga-companion-intro';

    if (sessionStorage.getItem(key)) {
      return;
    }

    sessionStorage.setItem(key, '1');

    setIntro(true);

    useCompanionStore.getState().applyRuntimeEvent({
      type: 'online',
      operation: 'greeting',
      message: 'Your companion is ready to help with real Xroga work.',
      source: 'deterministic',
    });

    const timer = window.setTimeout(
      () => setIntro(false),
      1_050,
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /**
   * Clear any delayed usage close when the component unmounts.
   */
  useEffect(() => {
    return () => {
      if (usageCloseTimerRef.current !== null) {
        clearTimeout(usageCloseTimerRef.current);

        usageCloseTimerRef.current = null;
      }
    };
  }, []);

  /**
   * Clicking anywhere outside both Smoky and the usage card
   * still closes the card immediately.
   */
  useEffect(() => {
    if (!usageOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const insideCompanion =
        rootRef.current?.contains(target) ?? false;

      const insideUsage =
        Boolean(target.closest('.xv-companion-usage'));

      if (!insideCompanion && !insideUsage) {
        setUsageOpen(false);
      }
    };

    document.addEventListener(
      'pointerdown',
      onPointerDown,
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        onPointerDown,
      );
    };
  }, [usageOpen]);

  /**
   * Keep the usage card positioned beside Smoky.
   */
  useLayoutEffect(() => {
    if (!usageOpen) {
      return;
    }

    const sync = () => {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect =
        trigger.getBoundingClientRect();

      const gutter = 8;

      const width = Math.min(
        236,
        window.innerWidth - gutter * 2,
      );

      const left = Math.min(
        Math.max(
          gutter,
          rect.right - width,
        ),
        window.innerWidth - width - gutter,
      );

      const estimatedHeight = 168;

      const openAbove =
        rect.top >=
        estimatedHeight + gutter * 2;

      setUsageStyle({
        position: 'fixed',

        left,

        top: openAbove
          ? Math.max(
              gutter,
              rect.top -
                estimatedHeight -
                gutter,
            )
          : Math.min(
              window.innerHeight -
                estimatedHeight -
                gutter,
              rect.bottom + gutter,
            ),

        width,

        zIndex: 1200,
      });
    };

    sync();

    window.addEventListener(
      'resize',
      sync,
    );

    window.addEventListener(
      'scroll',
      sync,
      true,
    );

    window.visualViewport?.addEventListener(
      'resize',
      sync,
    );

    return () => {
      window.removeEventListener(
        'resize',
        sync,
      );

      window.removeEventListener(
        'scroll',
        sync,
        true,
      );

      window.visualViewport?.removeEventListener(
        'resize',
        sync,
      );
    };
  }, [usageOpen]);

  if (
    !state.visible &&
    variant !== 'preview'
  ) {
    return null;
  }

  /**
   * The preview in Settings is artwork only,
   * not an interactive control.
   */
  const interactive =
    variant !== 'preview';

  return (
    <div
      ref={rootRef}
      className={cn(
        'xv-companion',
        `xv-companion--${variant}`,
        intro && 'is-intro',
        className,
      )}
      data-testid={`xroga-companion-${variant}`}
      data-operation={operation}
      data-mood={state.mood}
    >
      {interactive ? (
        <button
          ref={triggerRef}
          type="button"
          className="xv-companion-trigger"
          onClick={() => {
            cancelUsageClose();

            setUsageOpen(
              (current) => !current,
            );
          }}
          onMouseEnter={openUsage}
          onMouseLeave={scheduleUsageClose}
          onFocus={openUsage}
          aria-expanded={usageOpen}
          aria-label="Show usage"
          title="Usage"
        >
          <CompanionRenderer
            mood={state.mood}
            operation={operation}
            costume={state.costume}
            accent={state.accent}
            mantleEnabled={
              state.mantleEnabled
            }
          />
        </button>
      ) : (
        <span
          className="xv-companion-trigger"
          aria-hidden="true"
        >
          <CompanionRenderer
            mood={state.mood}
            operation={operation}
            costume={state.costume}
            accent={state.accent}
            mantleEnabled={
              state.mantleEnabled
            }
          />
        </span>
      )}

      {usageOpen &&
      interactive &&
      typeof document !== 'undefined'
        ? createPortal(
            <CompanionUsagePopover
              onClose={closeUsage}
              onMouseEnter={
                cancelUsageClose
              }
              onMouseLeave={
                scheduleUsageClose
              }
              style={usageStyle}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
