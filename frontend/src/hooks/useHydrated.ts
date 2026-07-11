'use client';

import { useEffect, useState } from 'react';

/** True after the client has mounted — use before reading persisted Zustand state in render. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
