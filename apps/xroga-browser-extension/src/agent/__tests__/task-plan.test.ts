import { describe, expect, it } from 'vitest';
import { MAX_MILESTONES, TaskPlan } from '../task-plan';

const three = [{ id: 'read', title: 'Understand the store' }, { id: 'edit', title: 'Edit products', check: { text: 'Saved' } }, { id: 'verify', title: 'Check the result' }];

describe('TaskPlan', () => {
  it('sets a plan, starts the first milestone, and rejects bad input', () => {
    const p = new TaskPlan();
    expect(p.set(three)).toBeNull();
    expect(p.snapshot().milestones.map(m => m.status)).toEqual(['working', 'pending', 'pending']);
    expect(new TaskPlan().set([])).toContain('non-empty');
    expect(new TaskPlan().set([{ id: 'A!', title: 'x' }])).toContain('lower case');
    expect(new TaskPlan().set([{ id: 'a', title: '' }])).toContain('title');
    expect(new TaskPlan().set([{ id: 'a', title: 'x' }, { id: 'a', title: 'y' }])).toContain('twice');
    expect(new TaskPlan().set(Array.from({ length: MAX_MILESTONES + 1 }, (_, i) => ({ id: `m${i}`, title: 't' })))).toContain('at most');
  });
  it('finishing a milestone starts the next one; a revision keeps verified milestones', () => {
    const p = new TaskPlan();
    p.set(three);
    p.apply('read', 'verified');
    expect(p.snapshot().milestones.map(m => m.status)).toEqual(['verified', 'working', 'pending']);
    p.set([{ id: 'read', title: 'Understand the store' }, { id: 'other', title: 'A better method' }]);
    expect(p.snapshot().milestones.map(m => `${m.id}:${m.status}`)).toEqual(['read:verified', 'other:working']);
  });
  it('follows observed results: failure means recovering, success means working again, a pending user step means waiting', () => {
    const p = new TaskPlan();
    p.set(three);
    expect(p.markFailure()).toBe(true);
    expect(p.get('read')!.status).toBe('recovering');
    expect(p.markSuccess()).toBe(true);
    expect(p.get('read')!.status).toBe('working');
    expect(p.markWaiting(true)).toBe(true);
    expect(p.get('read')!.status).toBe('waiting');
    expect(p.markWaiting(false)).toBe(true);
    expect(p.get('read')!.status).toBe('working');
    expect(new TaskPlan().markFailure()).toBe(false);
  });
  it('validates an update and renders a checklist the model can read', () => {
    const p = new TaskPlan();
    p.set(three);
    expect(p.validateUpdate('nope', 'done')).toContain('no milestone');
    expect(p.validateUpdate('read', 'verified')).toContain('status is one of');
    expect(p.validateUpdate('read', 'done')).toBeNull();
    expect(p.render()).toContain('[~] read');
    expect(p.render()).toContain('verifiable');
  });
  it('restores from a stored snapshot and ignores damaged entries', () => {
    const p = new TaskPlan();
    p.set(three);
    p.apply('read', 'reported');
    const back = TaskPlan.restore(p.snapshot());
    expect(back.snapshot()).toEqual(p.snapshot());
    expect(TaskPlan.restore({ revision: 1, milestones: [{ id: 'BAD ID', title: 'x', status: 'pending' }] }).active).toBe(false);
    expect(TaskPlan.restore(undefined).active).toBe(false);
  });
});
