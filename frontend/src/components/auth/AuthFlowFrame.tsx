import Link from 'next/link';
import { AuthModernCard } from './AuthModern';
import styles from './AuthShell.module.css';

export function AuthFlowFrame({ title, subtitle, children, hideBack = false }: {
  title: string; subtitle: string; children: React.ReactNode; hideBack?: boolean;
}) {
  return <main className={`${styles.page} flex min-h-screen items-center justify-center px-5 py-12`}>
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--auth-input,#121824)] p-7 shadow-2xl">
      {!hideBack && <Link href="/auth/login" className="mb-7 inline-block text-xs font-semibold text-[#69a4ff] hover:underline">← Back to sign in</Link>}
      <AuthModernCard title={title} subtitle={subtitle}>{children}</AuthModernCard>
    </section>
  </main>;
}
