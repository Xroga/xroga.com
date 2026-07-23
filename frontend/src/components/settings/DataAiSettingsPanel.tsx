'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, LogIn, Mail, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { exportUserData, clearLocalUserData } from '@/lib/exportUserData';
import toast from 'react-hot-toast';

export function DataAiSettingsPanel({ email }: { email: string }) {
  const router = useRouter();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeleting(true);
    try {
      clearLocalUserData();
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success('Account signed out and local data cleared');
      router.push('/');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg">Data & AI</h2>
        <p className="text-xs text-[var(--muted)] mt-1">
          Manage your account and exported data. Xroga calls pretrained AI APIs — it does not train models.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--card-border)]/50 p-4 space-y-3">
        <h3 className="text-sm font-medium">Account</h3>
        <div className="flex items-center gap-2 text-sm">
          <Mail className="w-4 h-4 text-[var(--muted)] shrink-0" />
          <span className="text-[var(--muted)]">Signed in as</span>
          <span className="font-medium truncate">{email || 'Guest — not signed in'}</span>
        </div>
        {!email && (
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
          >
            <LogIn className="w-4 h-4" /> Sign in
          </Link>
        )}
        {email && (
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <LogIn className="w-3.5 h-3.5" /> Manage sign-in options
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-[var(--card-border)]/50 p-4 space-y-3">
        <h3 className="text-sm font-medium">Your data</h3>
        <p className="text-xs text-[var(--muted)]">Download chats, projects, and media metadata saved on this device.</p>
        <button
          type="button"
          onClick={() => {
            exportUserData();
            toast.success('Export started');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm hover:border-[var(--accent)]/40 transition-colors"
        >
          <Download className="w-4 h-4" /> Export data
        </button>
      </div>

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-400">Delete your account forever</h3>
            <p className="text-xs text-[var(--muted)] mt-1">
              Permanently removes local chats, projects, and media from this device and signs you out. This cannot be undone.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setDeleteConfirm('');
            setShowDeleteModal(true);
          }}
          className="px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-sm font-medium"
        >
          Delete account forever
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--card-border)] p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-red-400">Delete account forever?</h3>
            <p className="text-sm text-[var(--muted)]">
              This clears all local data and signs you out. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 rounded-lg border border-[var(--card-border)] text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || deleteConfirm !== 'DELETE'}
                onClick={() => void handleDeleteAccount()}
                className="flex-1 py-2 rounded-lg bg-red-600 text-sm text-white disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
