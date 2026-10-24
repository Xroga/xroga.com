/** Only hosted Supabase project origins may receive Supabase credentials. */
export function projectRefFromUrl(projectUrl: string): string | null {
  try {
    const url = new URL(projectUrl.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || url.pathname !== '/' || url.search || url.hash) return null;
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
