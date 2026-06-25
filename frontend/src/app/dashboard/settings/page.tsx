'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/utils';
import { User, Save } from 'lucide-react';

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile>({
    display_name: '',
    avatar_url: '',
    timezone: 'UTC',
    language: 'en',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const data = await apiFetch('/api/profile', {}, session.access_token);
        setProfile(data);
      } catch {
        // Fallback to Supabase direct
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
          if (data) setProfile(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      }, session.access_token);

      setMessage('Profile saved successfully');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse h-64 bg-white/5 rounded-xl" />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--muted)]">Manage your profile and preferences</p>
      </div>

      <form onSubmit={handleSave} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 space-y-5">
        <div className="flex items-center gap-4 pb-4 border-b border-[var(--card-border)]">
          <div className="w-16 h-16 rounded-full bg-violet-600/20 flex items-center justify-center">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-violet-400" />
            )}
          </div>
          <div>
            <p className="font-medium">{profile.display_name || 'Set your name'}</p>
            <p className="text-xs text-[var(--muted)]">Avatar upload coming in Phase 4</p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">Display Name</label>
          <input
            value={profile.display_name ?? ''}
            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">Avatar URL</label>
          <input
            value={profile.avatar_url ?? ''}
            onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
            className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
            placeholder="https://..."
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Timezone</label>
            <select
              value={profile.timezone}
              onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern (US)</option>
              <option value="America/Los_Angeles">Pacific (US)</option>
              <option value="Europe/London">London</option>
              <option value="Asia/Karachi">Karachi</option>
              <option value="Asia/Kolkata">India</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">Language</label>
            <select
              value={profile.language}
              onChange={(e) => setProfile({ ...profile, language: e.target.value })}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
            >
              <option value="en">English</option>
              <option value="ur">Urdu</option>
              <option value="hi">Hindi</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.includes('success') ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
