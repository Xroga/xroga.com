import { describe, expect, it } from 'vitest';
import { checkUserSkill, matchUserSkills, renderUserSkill, type UserSkill } from '../user-skills';

describe('checkUserSkill', () => {
  it('accepts a method with a valid name and a description, and normalises the name', () => {
    const r = checkUserSkill({ name: 'Weekly-Report', description: 'Use when the weekly sales report is due.', body: '1. Open the dashboard.\n2. Export the CSV.\n3. Check the total.' });
    expect(r.ok && r.skill.name).toBe('weekly-report');
  });
  it('refuses a bad name, an empty body, a missing description and anything that looks like a secret', () => {
    expect(checkUserSkill({ name: 'bad_name', description: 'x', body: 'y' }).ok).toBe(false);
    expect(checkUserSkill({ name: 'ok', description: 'x', body: '   ' }).ok).toBe(false);
    expect(checkUserSkill({ name: 'ok', description: '', body: 'steps' }).ok).toBe(false);
    expect(checkUserSkill({ name: 'ok', description: 'x', body: 'log in with password: hunter2hunter2' }).ok).toBe(false);
    expect(checkUserSkill({ name: 'ok', description: 'x', body: 'use key sk-abcdefghijklmnopqrstuvwxyz' }).ok).toBe(false);
  });
});

describe('matchUserSkills', () => {
  const skills: UserSkill[] = [
    { name: 'weekly-report', description: 'Use when the weekly sales report is due.', body: 'b', savedAt: 1 },
    { name: 'invoice-chase', description: 'Use to chase unpaid invoices by email.', body: 'b', savedAt: 2 },
  ];
  it('finds the skill whose name and description share words with the request, and none for an unrelated one', () => {
    expect(matchUserSkills(skills, 'prepare the weekly sales report')[0]?.name).toBe('weekly-report');
    expect(matchUserSkills(skills, 'send a reminder about unpaid invoices')[0]?.name).toBe('invoice-chase');
    expect(matchUserSkills(skills, 'book a flight to lisbon')).toEqual([]);
  });
  it('says plainly that the skill grants nothing', () => {
    expect(renderUserSkill(skills[0]!)).toMatch(/grants no permission/);
  });
});
