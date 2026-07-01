'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface TerminalScrollContextValue {
  showJumpToLatest: boolean;
  setShowJumpToLatest: (v: boolean) => void;
  registerScrollToLatest: (fn: (behavior?: ScrollBehavior) => void) => void;
  scrollToLatest: (behavior?: ScrollBehavior) => void;
}

const TerminalScrollContext = createContext<TerminalScrollContextValue | null>(null);

export function TerminalScrollProvider({ children }: { children: ReactNode }) {
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollFnRef = useRef<(behavior?: ScrollBehavior) => void>(() => {});

  const registerScrollToLatest = useCallback((fn: (behavior?: ScrollBehavior) => void) => {
    scrollFnRef.current = fn;
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollFnRef.current(behavior);
  }, []);

  return (
    <TerminalScrollContext.Provider
      value={{ showJumpToLatest, setShowJumpToLatest, registerScrollToLatest, scrollToLatest }}
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
