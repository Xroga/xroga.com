/**
 * User-facing build todo state — step-by-step progress synced to the UI.
 */

import { seedUserTodos, type UserTodoItem } from './buildUserTodos.js';

export function createTodoState(userPrompt: string) {
  const items: UserTodoItem[] = seedUserTodos(userPrompt);
  let analysis = '';
  let codeGenBaseLabel = items.find((t) => t.id === 'code-gen')?.label ?? 'Generate code step by step';
  let codeStepCurrent = 0;
  let codeStepTotal = 0;

  const find = (id: string) => items.find((t) => t.id === id);

  /** Map legacy internal meta ids → user-facing todo ids. */
  const resolveId = (id: string): string | null => {
    if (find(id)) return id;
    if (id === 'steps' || id === 'verify-plan') return find('structure') ? 'structure' : find('plan') ? 'plan' : null;
    if (id === 'final-check' || id === 'emit') return find('verify') ? 'verify' : null;
    return null;
  };

  const snapshot = (): UserTodoItem[] => items.map((t) => ({ ...t }));

  const setAnalysis = (text: string) => {
    analysis = text.slice(0, 400);
  };

  const getAnalysis = () => analysis;

  /** Mark one todo active; all prior todos become done. */
  const activate = (id: string) => {
    const resolved = resolveId(id);
    if (!resolved) return;
    let passed = false;
    for (const item of items) {
      if (item.id === resolved) {
        item.status = 'active';
        passed = true;
      } else if (!passed) {
        item.status = 'done';
      } else if (item.status === 'active') {
        item.status = 'pending';
      }
    }
  };

  const complete = (id: string) => {
    const resolved = resolveId(id);
    if (!resolved) return;
    const item = find(resolved);
    if (item) item.status = 'done';
  };

  /** Mark this todo and all before it as done. */
  const completeThrough = (id: string) => {
    const resolved = resolveId(id);
    if (!resolved) return;
    let found = false;
    for (const item of items) {
      if (item.id === resolved) {
        item.status = 'done';
        found = true;
      } else if (!found) {
        item.status = 'done';
      }
    }
  };

  const setCodeGenSteps = (total: number, baseLabel?: string) => {
    codeStepTotal = total;
    codeStepCurrent = 0;
    if (baseLabel) codeGenBaseLabel = baseLabel;
    const codeGen = find('code-gen');
    if (codeGen && total > 0) {
      codeGen.label = `${codeGenBaseLabel} (1/${total})`;
      codeGen.status = 'active';
    }
  };

  const advanceCodeStep = (index: number, total: number, target?: string) => {
    codeStepCurrent = index + 1;
    codeStepTotal = total;
    const codeGen = find('code-gen');
    if (!codeGen) return;
    codeGen.status = 'active';
    const stepNote = target ? ` — ${target}` : '';
    codeGen.label = `${codeGenBaseLabel} (${index + 1}/${total})${stepNote}`;
  };

  const completeCodeGen = () => {
    const codeGen = find('code-gen');
    if (codeGen) {
      codeGen.status = 'done';
      codeGen.label = codeGenBaseLabel;
    }
    codeStepCurrent = 0;
    codeStepTotal = 0;
  };

  const completeAll = () => {
    for (const item of items) item.status = 'done';
  };

  // Legacy aliases used throughout engine.ts
  const activateMeta = activate;
  const completeMeta = complete;
  const completeMetaThrough = completeThrough;
  const activateBuild = (index: number) => {
    if (codeStepTotal > 0) advanceCodeStep(index, codeStepTotal);
    else activate('code-gen');
  };
  const completeBuild = (index: number) => {
    if (index + 1 >= codeStepTotal) completeCodeGen();
  };
  const setBuildSteps = (steps: string[]) => {
    const codeGen = find('code-gen');
    if (codeGen) codeGenBaseLabel = codeGen.label.replace(/\s*\(\d+\/\d+\).*$/, '').trim();
    completeThrough('plan');
    const structure = find('structure');
    if (structure && structure.status !== 'done') complete('structure');
    const uiTrends = find('ui-trends');
    if (uiTrends && uiTrends.status !== 'done') complete('ui-trends');
    setCodeGenSteps(steps.length);
  };
  const completeAllBuild = completeCodeGen;
  const addFinalTodos = () => {
    /* user todos already include verify, github-push, live-deploy */
  };
  const activateFinal = (id: 'github-push' | 'live-deploy' | 'final-check' | 'emit' | 'verify') => {
    if (id === 'final-check' || id === 'emit') {
      activate('verify');
      return;
    }
    if (id === 'verify') {
      activate('verify');
      return;
    }
    activate(id);
  };
  const completeFinal = (id: 'github-push' | 'live-deploy' | 'final-check' | 'emit' | 'verify') => {
    if (id === 'final-check' || id === 'emit') {
      complete('verify');
      return;
    }
    complete(id);
  };

  return {
    snapshot,
    setAnalysis,
    getAnalysis,
    activate,
    complete,
    completeThrough,
    setCodeGenSteps,
    advanceCodeStep,
    completeCodeGen,
    completeAll,
    activateMeta,
    completeMeta,
    completeMetaThrough,
    setBuildSteps,
    activateBuild,
    completeBuild,
    completeAllBuild,
    addFinalTodos,
    activateFinal,
    completeFinal,
  };
}

export type TodoState = ReturnType<typeof createTodoState>;
