'use client';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { AuthShowcase } from './AuthShowcase';
import styles from './AuthShell.module.css';

export function AuthShell({ mode }: { mode: 'signup' | 'login' }) {
  return (
    <main className={styles.page} data-auth-mode={mode}>
      <div className={styles.particles} aria-hidden="true" />
      <div className={styles.shell}>
        <div className={styles.story}><AuthShowcase /></div>
        <section className={styles.formArea} aria-label="Account access">
          <div className={styles.form}>
            {mode === 'signup' ? <SignupForm /> : <LoginForm />}
          </div>
        </section>
      </div>
    </main>
  );
}
