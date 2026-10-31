'use client';
import { Component, createContext, lazy, Suspense, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { adaptResponseV2, type ResponseInputV2 } from './document';
const Canvas = lazy(() => import('./ResponseCanvasV2'));
const FounderContext = createContext<string | null>(null);

/** The ID comes only from request-scoped server authorization, never a query ID. */
export function ResponseExperienceProvider({ founderId, children }: { founderId: string | null; children: ReactNode }) {
  return <FounderContext.Provider value={founderId}>{children}</FounderContext.Provider>;
}
class PresentationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function ResponseExperienceGate({ message, streaming, children }: { message: ResponseInputV2; streaming: boolean; children: ReactNode }) {
  const founderId = useContext(FounderContext);
  const profileId = useAppStore(s => s.profile?.id);
  const enabled = Boolean(founderId && founderId === profileId);
  const result = useMemo(() => enabled ? adaptResponseV2(message, streaming) : null, [enabled, message, streaming]);
  if (!result?.supported || !result.document.nodes.length) return <>{children}</>;
  return <PresentationBoundary key={message.id} fallback={children}><Suspense fallback={children}><Canvas document={result.document} /></Suspense></PresentationBoundary>;
}
