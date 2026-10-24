import { createHash } from 'node:crypto';

export type AuthorityJson = null | boolean | number | string | AuthorityJson[] | { [key: string]: AuthorityJson };
const invalid = (): never => { throw new Error('Invalid prepared-action parameters.'); };

/** Exact JSON only. Never let JSON.stringify silently erase or coerce authority. */
export function canonicalAuthorityValue(value: unknown): AuthorityJson {
  const active = new Set<object>();
  let nodes = 0;
  function visit(item: unknown, depth: number): AuthorityJson {
    if (++nodes > 20_000 || depth > 48) return invalid();
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      if (Buffer.byteLength(item) > 262_144 || Buffer.from(item).toString('utf8') !== item) return invalid();
      return item;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) return invalid();
      return item;
    }
    if (typeof item !== 'object' || active.has(item)) return invalid();
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return invalid();
    active.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Reflect.ownKeys(item).some(key => typeof key !== 'string')) return invalid();
      if (Array.isArray(item)) {
        if (Object.keys(descriptors).length !== item.length + 1) return invalid();
        return Array.from({ length: item.length }, (_, index) => {
          const property = descriptors[String(index)];
          if (!property || !property.enumerable || !('value' in property)) return invalid();
          return visit(property.value, depth + 1);
        });
      }
      return Object.fromEntries(Object.keys(descriptors).sort().map(key => {
        const property = descriptors[key]!;
        if (!property.enumerable || !('value' in property) || ['__proto__', 'constructor', 'prototype'].includes(key)
          || Buffer.from(key).toString('utf8') !== key) return invalid();
        return [key, visit(property.value, depth + 1)];
      }));
    } finally { active.delete(item); }
  }
  return visit(value, 0);
}

export function canonicalAuthorityJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalAuthorityValue(value));
  if (Buffer.byteLength(serialized) > 262_144) return invalid();
  return serialized;
}

export function preparedActionDigest(value: unknown): string {
  return createHash('sha256').update(canonicalAuthorityJson(value)).digest('hex');
}
