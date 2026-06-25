import Link from 'next/link';
import { Zap } from 'lucide-react';
import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">Xroga</span>
          </Link>
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Plans from $19/mo — subscribe to get started</p>
        </div>

        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
