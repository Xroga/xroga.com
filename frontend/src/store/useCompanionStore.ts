'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_COMPANION_PREFERENCES,
  moodForOperation,
  OPERATION_LABELS,
  validateCompanionName,
  type CompanionEventSource,
  type CompanionMood,
  type CompanionOperation,
  type CompanionPreferences,
  type CompanionRuntimeEvent,
} from '@/lib/companion';

interface CompanionState extends CompanionPreferences {
  mood: CompanionMood;
  operation: CompanionOperation;
  statusMessage: string;
  eventSource: CompanionEventSource;
  evidenceAt: string | null;
  panelOpen: boolean;
  accountName: string | null;
  serverHydrated: boolean;
  updatePreferences: (patch: Partial<CompanionPreferences>) => void;
  hydratePreferences: (patch: Partial<CompanionPreferences>, accountName?: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  applyRuntimeEvent: (event: CompanionRuntimeEvent) => void;
  previewMood: (mood: CompanionMood) => void;
  feed: () => void;
}

const validPreferenceKeys = new Set<keyof CompanionPreferences>(Object.keys(DEFAULT_COMPANION_PREFERENCES) as Array<keyof CompanionPreferences>);

export function companionPreferencesFromUnknown(value: unknown): Partial<CompanionPreferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Partial<CompanionPreferences> = {};
  for (const key of validPreferenceKeys) {
    if (!(key in source)) continue;
    (result as Record<string, unknown>)[key] = source[key];
  }
  return result;
}

export function companionPreferencesSnapshot(state: CompanionState): CompanionPreferences {
  return {
    name: validateCompanionName(state.name),
    costume: state.costume,
    accent: state.accent,
    size: state.size,
    dock: state.dock,
    visible: state.visible,
    voiceEnabled: state.voiceEnabled,
    careEnabled: state.careEnabled,
    reducedGamification: state.reducedGamification,
    crownEnabled: state.crownEnabled,
    mantleEnabled: state.mantleEnabled,
    lastFedAt: state.lastFedAt,
  };
}

export const useCompanionStore = create<CompanionState>()(
  persist(
    (set) => ({
      ...DEFAULT_COMPANION_PREFERENCES,
      mood: 'professional',
      operation: 'idle',
      statusMessage: OPERATION_LABELS.idle,
      eventSource: 'deterministic',
      evidenceAt: null,
      panelOpen: false,
      accountName: null,
      serverHydrated: false,
      updatePreferences: (patch) => set((state) => ({
        ...patch,
        ...(patch.name !== undefined ? { name: validateCompanionName(patch.name) } : {}),
        serverHydrated: state.serverHydrated,
      })),
      hydratePreferences: (patch, accountName) => set({
        ...patch,
        ...(patch.name !== undefined ? { name: validateCompanionName(patch.name) } : {}),
        accountName: accountName?.trim() || null,
        serverHydrated: true,
      }),
      setPanelOpen: (panelOpen) => set({ panelOpen }),
      previewMood: (mood) => set({ mood, operation: 'idle', statusMessage: `${mood[0].toUpperCase()}${mood.slice(1)} mood preview`, eventSource: 'deterministic' }),
      feed: () => set({
        lastFedAt: new Date().toISOString(),
        mood: 'happy',
        operation: 'success',
        statusMessage: 'Code energy recharged for the week',
        eventSource: 'deterministic',
        evidenceAt: new Date().toISOString(),
      }),
      applyRuntimeEvent: (event) => set((state) => {
        const operation: CompanionOperation = event.operation ?? (
          event.type === 'composer_focused' ? 'greeting'
            : event.type === 'voice_listening' ? 'listening'
              : event.type === 'prompt_submitted' ? 'thinking'
                : event.type === 'assistant_response' || event.type === 'task_success' ? 'success'
                  : event.type === 'task_warning' ? 'warning'
                    : event.type === 'task_failure' ? 'failure'
                      : event.type === 'task_interrupted' ? 'interrupted'
                        : event.type === 'integration_connecting' ? 'connecting_integration'
                          : event.type === 'waiting_for_approval' ? 'waiting_for_approval'
                            : event.type === 'offline' ? 'offline'
                              : event.type === 'online' ? 'idle'
                                : state.operation
        );
        return {
          operation,
          mood: moodForOperation(operation),
          statusMessage: event.message?.trim().slice(0, 180) || OPERATION_LABELS[operation],
          eventSource: event.source ?? (event.type === 'assistant_response' ? 'ai' : 'runtime'),
          evidenceAt: event.evidenceAt ?? new Date().toISOString(),
        };
      }),
    }),
    {
      name: 'xroga-companion',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => companionPreferencesSnapshot(state),
      version: 1,
    },
  ),
);
