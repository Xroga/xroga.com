import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ArtifactSelection = {
  artifactId: string;
  blockId: string;
  kind: 'rows' | 'chart-point' | 'node' | 'artifact';
  label: string;
  recordIds?: string[];
};

type ArtifactContextState = {
  activeArtifactId: string | null;
  activeArtifactTitle: string | null;
  selections: ArtifactSelection[];
  activate: (id: string, title: string) => void;
  addSelection: (selection: ArtifactSelection) => void;
  removeSelection: (blockId: string) => void;
  clear: () => void;
};

export const useXrogaArtifactContext = create<ArtifactContextState>()(persist((set) => ({
  activeArtifactId: null,
  activeArtifactTitle: null,
  selections: [],
  activate: (activeArtifactId, activeArtifactTitle) => set({ activeArtifactId, activeArtifactTitle }),
  addSelection: (selection) => set((state) => ({ selections: [...state.selections.filter((item) => item.blockId !== selection.blockId), selection].slice(-6) })),
  removeSelection: (blockId) => set((state) => ({ selections: state.selections.filter((item) => item.blockId !== blockId) })),
  clear: () => set({ activeArtifactId: null, activeArtifactTitle: null, selections: [] }),
}), {
  name: 'xroga-artifact-context-v1',
  storage: createJSONStorage(() => localStorage),
  partialize: ({ activeArtifactId, activeArtifactTitle, selections }) => ({ activeArtifactId, activeArtifactTitle, selections }),
}));

export function buildArtifactContextPreamble(state: Pick<ArtifactContextState, 'activeArtifactId' | 'activeArtifactTitle' | 'selections'>): string {
  if (!state.activeArtifactId && state.selections.length === 0) return '';
  const payload = {
    artifact: state.activeArtifactId ? { id: state.activeArtifactId, title: state.activeArtifactTitle } : undefined,
    selections: state.selections.map(({ artifactId, blockId, kind, label, recordIds }) => ({ artifactId, blockId, kind, label: label.slice(0, 160), recordIds: recordIds?.slice(0, 50) })),
  };
  return `[XROGA_ARTIFACT_CONTEXT]\n${JSON.stringify(payload)}\n[/XROGA_ARTIFACT_CONTEXT]\n\n`;
}
