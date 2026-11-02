'use client';
import { createContext } from 'react';
/** Set only by the authenticated Workspace gate. Synthetic previews do not persist. */
export const InteractionScopeV2 = createContext<string | null>(null);
