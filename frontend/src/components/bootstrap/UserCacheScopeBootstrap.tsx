import { buildUserCacheScopeScript } from '@/lib/userScopedCache';

/**
 * Runs before the authenticated shell is parsed. If another account used this
 * browser, remove only user-owned workspace data while retaining device-level
 * choices such as theme, language, density, and reduced motion.
 */
export function UserCacheScopeBootstrap({ userId }: { userId: string }) {
  const script = buildUserCacheScopeScript(userId);

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
