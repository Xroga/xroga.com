'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, LogIn, Mail, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { exportUserData, clearLocalUserData } from '@/lib/exportUserData';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SettingsCard, SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';

export function DataAiSettingsPanel({ email }: { email: string }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE' || deleting) return;
    setDeleting(true);
    try {
      await api.profile.deleteAccount();
      clearLocalUserData();
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success('Your account has been permanently deleted');
      // Hard navigation: router.refresh() would re-render the current shell route, whose
      // layout now sees no user and redirects to /auth/login, racing ahead of the push.
      window.location.assign('/');
    } catch (err) {
      toast.error((err as Error).message || 'Could not delete account — try again or contact support');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  return (
    <SettingsStack>
      <SettingsPanelHeader
        title="Data & AI"
        description="Manage your account and exported data. Xroga calls pretrained AI APIs — it does not train models on your data."
      />

      <SettingsCard>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Account</h3>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="text-[var(--text-secondary)]">Signed in as</span>
          <span className="truncate font-medium text-[var(--text-primary)]">{email || 'Guest — not signed in'}</span>
        </div>
        {!email && (
          <Link href="/auth/login" className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline">
            <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
          </Link>
        )}
        {email && (
          <Link href="/auth/login" className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Manage sign-in options
          </Link>
        )}
      </SettingsCard>

      <SettingsCard>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Your data</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Download chats, projects, and media metadata saved on this device.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            exportUserData();
            toast.success('Export started');
          }}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export data
        </Button>
      </SettingsCard>

      <SettingsCard tone="danger">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-medium text-[var(--danger)]">Delete your account forever</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Permanently deletes your Xroga account, profile, and projects from our servers, clears local chats and media from this device, and signs you out. This cannot be undone.
            </p>
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={() => {
            setDeleteConfirm('');
            setShowDeleteModal(true);
          }}
        >
          Delete account forever
        </Button>
      </SettingsCard>

      <Dialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete account forever?"
        description={<>This permanently deletes your account and all associated data from our servers. Type <strong>DELETE</strong> to confirm.</>}
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={deleteConfirm !== 'DELETE'}
              loading={deleting}
              onClick={() => void handleDeleteAccount()}
            >
              {deleting ? 'Deleting…' : 'Delete forever'}
            </Button>
          </>
        }
      >
        <input
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="Type DELETE"
          aria-label="Type DELETE to confirm"
          className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      </Dialog>
    </SettingsStack>
  );
}
