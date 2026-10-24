'use client';

import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { avatarProfileUrl, persistAvatarUpload } from '@/lib/avatarPersistence';

export function useAvatarUpdate() {
  const setProfile = useAppStore((s) => s.setProfile);

  async function setAvatarUrl(url: string): Promise<void> {
    try {
      const updated = await api.profile.update({ avatar_url: avatarProfileUrl(url, window.location.origin) });
      setProfile(updated);
      toast.success('Profile photo updated');
    } catch {
      throw new Error('Profile photo could not be saved. Please retry.');
    }
  }

  async function uploadAvatarFile(file: File) {
    await persistAvatarUpload(createClient(), file, setAvatarUrl);
  }

  return { setAvatarUrl, uploadAvatarFile };
}
