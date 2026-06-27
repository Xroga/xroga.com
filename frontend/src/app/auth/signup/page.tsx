import { SignupForm } from '@/components/auth/SignupForm';
import { Logo } from '@/components/layout/Logo';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--background)]">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Logo href="/" variant="header" height={56} />
        <p className="text-sm text-[var(--muted)]">50 free Actions on signup</p>
        <SignupForm />
      </div>
    </div>
  );
}
