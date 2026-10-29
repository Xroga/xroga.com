/**
 * Paths whose CONTENT is never read, indexed or shown, whatever the request says.
 *
 * Listing such a file is fine (it exists, and the project passport may say so); fetching its blob is not: an environment file or a
 * private key read into a model prompt, a trace or a PR body is a disclosure no later redaction can undo. Redaction of secrets that
 * appear inside ordinary files is a second layer (`redactModelContext`), not a substitute for this one.
 */
const EXAMPLE_ENV = /^\.env\.(?:example|sample|template|dist|defaults?)$/i;

export function isSensitivePath(path: string): boolean {
  const normalised = path.replace(/\\/g, '/');
  const segments = normalised.split('/');
  const name = (segments[segments.length - 1] ?? '').toLowerCase();
  if (!name) return false;
  if (name === '.env' || (name.startsWith('.env.') && !EXAMPLE_ENV.test(name))) return true;
  if (['.npmrc', '.pypirc', '.netrc', '.git-credentials', '.dockercfg', 'credentials', 'secrets.json', 'secrets.yaml', 'secrets.yml', 'service-account.json'].includes(name)) return true;
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/.test(name) && !name.endsWith('.pub')) return true;
  if (/\.(?:pem|key|p12|pfx|jks|keystore|kdbx|ovpn)$/.test(name)) return true;
  const lowered = segments.map((s) => s.toLowerCase());
  if (lowered.includes('.ssh') || lowered.includes('.gnupg')) return true;
  if (lowered.includes('.aws') && ['credentials', 'config'].includes(name)) return true;
  if (lowered.includes('.docker') && name === 'config.json') return true;
  return false;
}
