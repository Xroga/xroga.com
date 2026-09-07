'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface TerminalScrollContextValue {
  showJumpToLatest: boolean;
  setShowJumpToLatest: (v: boolean) => void;
  registerScrollToFirst: (fn: (behavior?: ScrollBehavior) => void) => void;
  registerScrollToLatest: (fn: (behavior?: ScrollBehavior) => void) => void;
  scrollToFirst: (behavior?: ScrollBehavior) => void;
  scrollToLatest: (behavior?: ScrollBehavior) => void;
}

const TerminalScrollContext = createContext<TerminalScrollContextValue | null>(null);

export function TerminalScrollProvider({ children }: { children: ReactNode }) {
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const firstScrollFnRef = useRef<(behavior?: ScrollBehavior) => void>(() => {});
  const scrollFnRef = useRef<(behavior?: ScrollBehavior) => void>(() => {});

  const registerScrollToFirst = useCallback((fn: (behavior?: ScrollBehavior) => void) => {
    firstScrollFnRef.current = fn;
  }, []);

  const registerScrollToLatest = useCallback((fn: (behavior?: ScrollBehavior) => void) => {
    scrollFnRef.current = fn;
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollFnRef.current(behavior);
  }, []);

  const scrollToFirst = useCallback((behavior: ScrollBehavior = 'smooth') => {
    firstScrollFnRef.current(behavior);
  }, []);

  return (
    <TerminalScrollContext.Provider
      value={{ showJumpToLatest, setShowJumpToLatest, registerScrollToFirst, registerScrollToLatest, scrollToFirst, scrollToLatest }}
    >
      {children}
    </TerminalScrollContext.Provider>
  );
}

export function useTerminalScroll() {
  const ctx = useContext(TerminalScrollContext);
  if (!ctx) throw new Error('useTerminalScroll must be used within TerminalScrollProvider');
  return ctx;
}
