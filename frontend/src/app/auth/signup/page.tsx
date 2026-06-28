import { SignupForm } from '@/components/auth/SignupForm';
import { AuthShell } from '@/components/auth/AuthShell';

export default function SignupPage() {
  return (
    <AuthShell subtitle="50 free Actions on signup — create your profile first">
      <SignupForm />
    </AuthShell>
  );
}
