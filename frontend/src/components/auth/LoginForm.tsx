"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitHubIcon } from "@/components/icons/GitHubIcon";
import { createClient } from "@/lib/supabase/client";
import {
  AuthModernCard,
  AuthModernInput,
  AuthModernLabel,
  AuthGradientButton,
  AuthSwitchText,
} from "./AuthModern";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/workspace");
    router.refresh();
  }

  async function handleGitHub() {
    setError(null);
    setOauthLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setOauthLoading(false);
      setError(err.message);
    }
  }

  return (
    <AuthModernCard title="Welcome back" subtitle="Sign in to your workspace">
      <div className="mb-3">
        <button
          type="button"
          onClick={handleGitHub}
          disabled={oauthLoading || loading}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-sky-100 bg-slate-50/80 text-sm font-semibold text-slate-800 transition-colors hover:border-[#006aff]/40 disabled:opacity-60"
        >
          <GitHubIcon className="h-5 w-5 shrink-0" />
          Continue with GitHub
        </button>
      </div>

      <div className="relative mb-3">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-sky-100" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">or</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <AuthModernLabel>Email</AuthModernLabel>
          <AuthModernInput
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <AuthModernLabel>Password</AuthModernLabel>
          <AuthModernInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p className="text-red-500 text-sm text-center px-2" role="alert">
            {error}
          </p>
        )}
        <AuthGradientButton type="submit" disabled={loading || oauthLoading}>
          {loading ? "Signing in…" : "Sign in"}
        </AuthGradientButton>
      </form>

      <AuthSwitchText prompt="No account?" linkText="Sign up" href="/auth/signup" />
    </AuthModernCard>
  );
}
