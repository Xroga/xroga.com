import { describe, expect, it } from 'vitest';
import { skillsFor } from '../skills';

describe('the script-console playbook is chosen for painted editors', () => {
  it('is selected for the TraceDraw drawing request and carries the verified API', () => {
    const q = 'Use my TraceDraw tab (already open in this window). In a NEW document make a design: a blue rectangle and a red circle with the text Xroga under them. Then export it as SVG.';
    const picked = skillsFor(q);
    expect(picked.map(s => s.id)).toContain('app-script-console');
    expect(picked.find(s => s.id === 'app-script-console')!.body).toContain('ActiveLayer.CreateRectangle');
  });
  it('is not selected for an unrelated request', () => {
    expect(skillsFor('Summarize this page for me').map(s => s.id)).not.toContain('app-script-console');
  });
});
