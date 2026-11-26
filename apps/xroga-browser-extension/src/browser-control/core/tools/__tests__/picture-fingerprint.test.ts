import { describe, expect, it } from 'vitest';
import { pictureFingerprint } from '../observe';

describe('pictureFingerprint', () => {
  it('is the same for the same picture and different when a small part of it changes', () => {
    const a = 'A'.repeat(50_000);
    const b = a.slice(0, 25_000) + 'B'.repeat(200) + a.slice(25_200);
    expect(pictureFingerprint(a)).toBe(pictureFingerprint(a));
    expect(pictureFingerprint(a)).not.toBe(pictureFingerprint(b));
    expect(pictureFingerprint('')).toMatch(/^0:/);
  });
});
