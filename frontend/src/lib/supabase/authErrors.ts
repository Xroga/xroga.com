export function safeAuthError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('public configuration') || message.includes('invalid api key')) {
    return 'Authentication is temporarily unavailable. Please try again shortly.';
  }
  if (message.includes('signup') && (message.includes('disabled') || message.includes('not allowed'))) {
    return 'New account registration is temporarily unavailable.';
  }
  if (message.includes('provider') && (message.includes('disabled') || message.includes('not enabled'))) {
    return 'GitHub sign-in is not configured yet.';
  }
  if (message.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many authentication attempts. Please wait and try again.';
  }

  return fallback;
}

export async function withAuthTimeout<T>(operation: Promise<T>, timeoutMs = 8_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Authentication provider timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
