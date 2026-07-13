'use client';

import { createContext, useContext } from 'react';

export const SlideshowIndexContext = createContext(0);

export function useSlideshowIndex() {
  return useContext(SlideshowIndexContext);
}
