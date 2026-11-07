export function browserTarget(input: string): string | undefined {
  const value = input.trim();
  if (!value || value.length > 1_800) return;
  try {
    const target = /^[a-z][a-z0-9+.-]*:/i.test(value)
      ? new URL(value)
      : /^[^/\s]+\.[^/\s]+(?:\/[^\s]*)?$/.test(value)
        ? new URL(`https://${value}`)
        : new URL(`https://www.google.com/search?q=${encodeURIComponent(value)}`);
    if (target.protocol !== 'https:' || target.username || target.password || target.port) return;
    const host = target.hostname.replace(/\.$/, '');
    if (
      !host.includes('.') ||
      /^[\d.]+$/.test(host) ||
      host.includes(':') ||
      /\.(?:local|localhost|internal|home\.arpa)$/.test(host)
    )
      return;
    if (host === 'xroga.com' || host.endsWith('.xroga.com')) return;
    return target.href;
  } catch {
    return;
  }
}
