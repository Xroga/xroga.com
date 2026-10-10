'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEMO_PROJECTS, INITIAL_WORKFLOW, nextDemoStage, type DemoNodeKind, type DemoStage, type DemoStory, type DemoWorkflowNode } from '@/lib/osCommand2';

interface Command2State {
  story: DemoStory;
  stages: Record<DemoStory, DemoStage>;
  assetId: string;
  employeeId: string;
  workPack: string;
  budget: number;
  selectedFile: string;
  patchDecision: 'pending' | 'accepted-demo' | 'rejected-demo';
  browserStep: number;
  browserPaused: boolean;
  browserApproved: boolean;
  workflow: DemoWorkflowNode[];
  workflowResult: 'not-run' | 'passed-demo' | 'needs-review';
  experienceDecision: 'pending' | 'approved-demo' | 'rejected-demo';
  selectedArtifact: string;
  savedFinding: string | null;
  setStory: (story: DemoStory) => void;
  advance: (story: DemoStory) => void;
  setAsset: (id: string) => void;
  setEmployee: (id: string) => void;
  setWorkPack: (id: string) => void;
  setBudget: (amount: number) => void;
  setFile: (file: string) => void;
  setPatchDecision: (value: Command2State['patchDecision']) => void;
  browserNext: () => void;
  browserRetry: () => void;
  setBrowserPaused: (value: boolean) => void;
  setBrowserApproved: (value: boolean) => void;
  addNode: (kind: DemoNodeKind) => void;
  updateNode: (id: string, changes: Partial<Pick<DemoWorkflowNode, 'label' | 'detail' | 'next'>>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, direction: -1 | 1) => void;
  setWorkflowResult: (value: Command2State['workflowResult']) => void;
  setExperienceDecision: (value: Command2State['experienceDecision']) => void;
  setArtifact: (id: string) => void;
  saveFinding: (finding: string) => void;
  resetDemo: () => void;
}

const initial = () => ({
  story: 'clinic' as DemoStory,
  stages: { clinic:'request', 'browser-crm':'request', repair:'request' } as Record<DemoStory, DemoStage>,
  assetId: 'booking-foundation', employeeId: 'frontend-engineer', workPack: 'dental-clinic', budget: 18,
  selectedFile: 'src/BookingForm.tsx', patchDecision: 'pending' as const,
  browserStep: 0, browserPaused: true, browserApproved: false,
  workflow: INITIAL_WORKFLOW.map((node) => ({ ...node })), workflowResult: 'not-run' as const,
  experienceDecision: 'pending' as const, selectedArtifact: 'booking-concept', savedFinding: null,
});

export const useOsCommand2Store = create<Command2State>()(persist((set) => ({
  ...initial(),
  setStory: (story) => { const project = DEMO_PROJECTS.find((item) => item.id === story)!; set({ story, assetId:project.proposedAsset, employeeId:project.proposedEmployee, selectedArtifact:project.artifact, selectedFile: story === 'repair' ? 'src/checkout.ts' : 'src/BookingForm.tsx' }); },
  advance: (story) => set((state) => ({ stages: { ...state.stages, [story]: nextDemoStage(state.stages[story]) } })),
  setAsset: (assetId) => set({ assetId }),
  setEmployee: (employeeId) => set({ employeeId }),
  setWorkPack: (workPack) => set({ workPack }),
  setBudget: (budget) => set({ budget: Math.max(1, Math.min(100, budget)) }),
  setFile: (selectedFile) => set({ selectedFile }),
  setPatchDecision: (patchDecision) => set({ patchDecision }),
  browserNext: () => set((state) => ({ browserStep: Math.min(5, state.browserStep + 1) })),
  browserRetry: () => set((state) => ({ browserStep: Math.max(1, state.browserStep - 1), browserPaused: true })),
  setBrowserPaused: (browserPaused) => set({ browserPaused }),
  setBrowserApproved: (browserApproved) => set({ browserApproved }),
  addNode: (kind) => set((state) => {
    if (state.workflow.length >= 24) return state;
    const id = `demo-${kind}-${Math.max(0,...state.workflow.map((node) => Number(node.id.match(/\d+$/)?.[0] ?? 0))) + 1}`;
    return { workflow: [...state.workflow, { id, kind, label: `New ${kind.replace('-', ' ')} step`, detail: 'Edit this local example step.', next: null }] };
  }),
  updateNode: (id, changes) => set((state) => ({ workflow: state.workflow.map((node) => node.id === id ? { ...node, ...changes } : node), workflowResult: 'not-run' })),
  removeNode: (id) => set((state) => ({ workflow: state.workflow.filter((node) => node.id !== id).map((node) => node.next === id ? { ...node, next: null } : node), workflowResult: 'not-run' })),
  moveNode: (id, direction) => set((state) => { const workflow = [...state.workflow]; const index = workflow.findIndex((node) => node.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= workflow.length) return state; [workflow[index], workflow[target]] = [workflow[target], workflow[index]]; return { workflow }; }),
  setWorkflowResult: (workflowResult) => set({ workflowResult }),
  setExperienceDecision: (experienceDecision) => set({ experienceDecision }),
  setArtifact: (selectedArtifact) => set({ selectedArtifact }),
  saveFinding: (savedFinding) => set({ savedFinding }),
  resetDemo: () => set(initial()),
}), { name:'xroga-os-command2-demo-v1', storage:createJSONStorage(() => localStorage), skipHydration:true, version:1 }));
