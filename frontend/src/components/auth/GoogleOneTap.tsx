'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { createClient } from '@/lib/supabase/client';
import { createGoogleOneTapNonce } from '@/lib/supabase/googleOneTapNonce';

// OAuth client IDs are public identifiers, not credentials. This client is
// already configured for Xroga's production Supabase Google provider.
const GOOGLE_CLIENT_ID = '574998934848-28kn45hktfb2vda7jm6lgee3ao9lahbu.apps.googleusercontent.com';
const PRODUCTION_ORIGIN = 'https://xroga.com';

type CredentialResponse = { credential?: string };
type GoogleIdentity = {
  initialize(options: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    auto_select: boolean;
    context: 'signin';
    color_scheme: 'dark';
  }): void;
  prompt(): void;
  cancel(): void;
};

function googleIdentity(): GoogleIdentity | undefined {
  return (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
}

/** Google owns the popup and may suppress it based on browser/session preferences. */
export function GoogleOneTap({ enabled }: { enabled: boolean }) {
  const [scriptReady, setScriptReady] = useState(false);
  const onProductionOrigin = typeof window !== 'undefined' && window.location.origin === PRODUCTION_ORIGIN;

  useEffect(() => {
    if (!enabled || !scriptReady || !onProductionOrigin) return;
    let cancelled = false;
    let signingIn = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const identity = googleIdentity();
          if (!identity || cancelled) return;
          const nonce = await createGoogleOneTapNonce();
          if (cancelled) return;
          identity.initialize({
            client_id: GOOGLE_CLIENT_ID,
            nonce: nonce.hashed,
            context: 'signin',
            color_scheme: 'dark',
            auto_select: false,
            callback: response => {
              const credential = response.credential;
              if (cancelled || signingIn || !credential) return;
              signingIn = true;
              void (async () => {
                try {
                  const supabase = createClient();
                  if (!supabase) return;
                  const { error } = await supabase.auth.signInWithIdToken({
                    provider: 'google',
                    token: credential,
                    nonce: nonce.raw,
                  });
                  if (error) return;
                  identity.cancel();
                  const { data: needsPhonePrompt, error: phonePromptError } =
                    await supabase.rpc('needs_current_contact_phone_prompt');
                  window.location.assign(!phonePromptError && needsPhonePrompt
                    ? '/auth/contact?next=%2Fworkspace'
                    : '/workspace');
                } catch {
                  // Keep ordinary Google OAuth and email login available.
                } finally {
                  signingIn = false;
                }
              })();
            },
          });
          identity.prompt();
        } catch {
          // Standard Google sign-in on /auth/login remains available.
        }
      })();
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      googleIdentity()?.cancel();
    };
  }, [enabled, scriptReady, onProductionOrigin]);

  if (!enabled || !onProductionOrigin) return null;
  return <Script
    src="https://accounts.google.com/gsi/client"
    strategy="afterInteractive"
    onReady={() => setScriptReady(true)}
  />;
}
