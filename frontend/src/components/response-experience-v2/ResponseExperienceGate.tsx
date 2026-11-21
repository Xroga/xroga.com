'use client';
import { Component, createContext, lazy, Suspense, useContext, useMemo, type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { adaptResponseV2, type ResponseInputV2 } from './document';
import { InteractionScopeV2 } from './interactionContext';
const Canvas = lazy(() => import('./ResponseCanvasV2'));
const PresentationAccessContext = createContext<string | null>(null);
const OpenUiContext = createContext(false);

/** The ID comes only from request-scoped server authorization, never a query ID. */
export function ResponseExperienceProvider({ authorizedUserId, openUi = false, children }: { authorizedUserId: string | null; openUi?: boolean; children: ReactNode }) {
  return <PresentationAccessContext.Provider value={authorizedUserId}><OpenUiContext.Provider value={openUi}>{children}</OpenUiContext.Provider></PresentationAccessContext.Provider>;
}
class PresentationBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function useResponseExperienceEnabled() {
  const authorizedUserId = useContext(PresentationAccessContext);
  const profileId = useAppStore(s => s.profile?.id);
  return Boolean(authorizedUserId && authorizedUserId === profileId);
}
export function ResponseExperienceGate({ message, streaming, children }: { message: ResponseInputV2; streaming: boolean; children: ReactNode }) {
  const authorizedUserId = useContext(PresentationAccessContext);
  const openUi = useContext(OpenUiContext);
  const profileId = useAppStore(s => s.profile?.id);
  const enabled = Boolean(authorizedUserId && authorizedUserId === profileId);
  const result = useMemo(() => enabled ? adaptResponseV2(message, streaming) : null, [enabled, message, streaming]);
  if (!result?.supported || !result.document.nodes.length) return <>{children}</>;
  return <PresentationBoundary key={message.id} fallback={children}><InteractionScopeV2.Provider value={JSON.stringify([authorizedUserId, message.id])}><Suspense fallback={children}><Canvas document={result.document} openUi={openUi} /></Suspense></InteractionScopeV2.Provider></PresentationBoundary>;
}
