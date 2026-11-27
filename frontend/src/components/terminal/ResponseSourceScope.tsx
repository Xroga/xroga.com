'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const RegisterCitation = createContext<((url: string) => () => void) | undefined>(undefined);
const emptyCitations: ReadonlyMap<string, number> = new Map();
const InlineCitations = createContext(emptyCitations);

export function ResponseSourceScope({ children }: { children: ReactNode }) {
  const [citations, setCitations] = useState(emptyCitations);
  const register = useCallback((url: string) => {
    setCitations(current => new Map(current).set(url, (current.get(url) ?? 0) + 1));
    return () => setCitations(current => {
      const next = new Map(current);
      const count = current.get(url) ?? 0;
      if (count > 1) next.set(url, count - 1);
      else next.delete(url);
      return next;
    });
  }, []);
  return <RegisterCitation.Provider value={register}>
    <InlineCitations.Provider value={citations}>{children}</InlineCitations.Provider>
  </RegisterCitation.Provider>;
}

export function useInlineCitation(url: string | null) {
  const register = useContext(RegisterCitation);
  useEffect(() => {
    if (url) return register?.(url);
  }, [register, url]);
}

export function useInlineCitations() {
  return useContext(InlineCitations);
}
