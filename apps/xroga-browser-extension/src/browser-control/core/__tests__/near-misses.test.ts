import { describe, expect, it } from 'vitest';
import { nearMisses } from '../interaction/resolve';
import type { ONode } from '../perception/outline';

const node = (role: string, name: string, ref: string | undefined, children: ONode[] = []): ONode =>
  ({ kind: 'element', role, rawRole: role, name, states: [], actionable: !!ref, ref, frameId: 'f', sessionId: 's', loaderId: 'l', children }) as unknown as ONode;

const page: ONode[] = [
  node('navigation', 'Folders', undefined, [
    node('link', 'Inbox', 'a1'),
    node('link', 'Drafts 4', 'a2'),
    node('button', 'Drafts', 'a3'),
    node('link', 'Sent', 'a4'),
  ]),
  node('heading', 'Mail', undefined),
  node('textbox', 'Search drafts', 'a5'),
];

describe('nearMisses', () => {
  it('offers the same name under another role first, then names that contain it, never a control it has no ref for', () => {
    const found = nearMisses(page, 'heading', 'Drafts');
    expect(found.map(n => n.ref)).toEqual(['a3', 'a2', 'a5']);
  });

  it('prefers the same role when the name only contains the asked one', () => {
    const found = nearMisses(page, 'link', 'Draft');
    expect(found[0]!.ref).toBe('a2');
  });

  it('ignores case and spacing, and offers the controls of the role when no name was given', () => {
    expect(nearMisses(page, 'button', '  DRAFTS ').map(n => n.ref)[0]).toBe('a3');
    expect(nearMisses(page, 'link', undefined).map(n => n.ref)).toEqual(['a1', 'a2', 'a4']);
  });

  it('finds nothing when no name or role is related, and caps the list at six', () => {
    expect(nearMisses(page, 'heading', 'Calendar')).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => node('link', `Draft ${i}`, `r${i}`));
    expect(nearMisses(many, 'heading', 'Draft')).toHaveLength(6);
  });
});
