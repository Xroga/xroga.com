type UserIdentity = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const METADATA_NAME_KEYS = ['full_name', 'name', 'user_name', 'preferred_username'] as const;

export function resolveUserDisplayName(
  user: UserIdentity | null | undefined,
  profileDisplayName?: string | null,
  fallback = 'there',
): string {
  const profileName = profileDisplayName?.trim();
  if (profileName) return profileName;

  for (const key of METADATA_NAME_KEYS) {
    const candidate = user?.user_metadata?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  const emailName = user?.email?.split('@')[0]?.trim();
  return emailName || fallback;
}
