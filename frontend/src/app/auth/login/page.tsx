import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/layout/Logo';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--background)]">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <Logo href="/" variant="header" height={56} />
        <LoginForm />
      </div>
    </div>
  );
}
