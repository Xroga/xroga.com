/** Display only explicit HTTP(S) evidence returned by the existing API. */
export function evidenceLinks(value: unknown): string[] {
  const found = new Set<string>();
  function visit(item: unknown, depth: number) {
    if (depth > 8 || found.size >= 50) return;
    if (typeof item === "string") {
      try {
        const url = new URL(item);
        if (["https:", "http:"].includes(url.protocol)) found.add(url.href);
      } catch {
        /* Not a URL. */
      }
    } else if (Array.isArray(item))
      item.slice(0, 100).forEach((child) => visit(child, depth + 1));
    else if (item && typeof item === "object")
      Object.values(item)
        .slice(0, 100)
        .forEach((child) => visit(child, depth + 1));
  }
  visit(value, 0);
  return [...found];
}
