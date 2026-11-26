// The manifest's permission lists. The product must not require a permission that adds an install warning the old
// Nanobrowser did not have, or Chrome turns it off on update until the user accepts; the autorun build requires them,
// so its checks run without a click.
import { describe, expect, it } from 'vitest';
import { OPTIONAL_PERMISSIONS, permissionLists } from '../manifest-permissions';

const FOUR = ['tabGroups', 'notifications', 'downloads', 'downloads.open'];
const DATA = ['history', 'bookmarks'];

describe('manifest permission lists', () => {
  it('the product makes the four optional and requires none of them', () => {
    const product = permissionLists('product');
    expect([...OPTIONAL_PERMISSIONS].sort()).toEqual([...FOUR].sort());
    for (const p of FOUR) expect(product.permissions).not.toContain(p);
    expect([...product.optional_permissions].sort()).toEqual([...FOUR].sort());
  });

  it('the product requires scripting, for the page border, and does not ask for activeTab', () => {
    const product = permissionLists('product');
    expect(product.permissions).toContain('scripting');
    expect(product.permissions).not.toContain('activeTab');
    expect(product.optional_permissions).not.toContain('activeTab');
  });

  it('the autorun build requires the four and has nothing optional', () => {
    const autorun = permissionLists('autorun');
    for (const p of FOUR) expect(autorun.permissions).toContain(p);
    expect(autorun.optional_permissions).toEqual([]);
  });

  it('Xroga asks for history and bookmarks only when the person allows them; the autorun build requires them for its checks', () => {
    const xroga = permissionLists('xroga');
    for (const p of DATA) {
      expect(xroga.permissions).not.toContain(p);
      expect(xroga.optional_permissions).toContain(p);
      expect(permissionLists('product').permissions).not.toContain(p);
      expect(permissionLists('autorun').permissions).toContain(p);
    }
  });

  it('both builds require the same other permissions', () => {
    const others = (list: string[]) => list.filter(p => !FOUR.includes(p) && !DATA.includes(p)).sort();
    expect(others(permissionLists('product').permissions)).toEqual(others(permissionLists('autorun').permissions));
  });
});
