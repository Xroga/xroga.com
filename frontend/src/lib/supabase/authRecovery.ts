// Enable only after production Supabase has a verified custom SMTP sender.
export const passwordRecoveryEnabled = process.env.NEXT_PUBLIC_AUTH_RECOVERY_ENABLED === 'true';
