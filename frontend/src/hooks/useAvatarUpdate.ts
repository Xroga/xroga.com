'use client';

import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';

export function useAvatarUpdate() {
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);

  async function setAvatarUrl(url: string): Promise<void> {
    try {
      const updated = await api.profile.update({ avatar_url: url });
      setProfile(updated);
      toast.success('Profile photo updated');
    } catch {
      setProfile({
        ...(profile ?? { display_name: '', timezone: 'UTC', language: 'en', avatar_url: null }),
        avatar_url: url,
      });
      toast.success('Profile photo updated locally');
    }
  }

  async function uploadAvatarFile(file: File) {
    const supabase = createClient();
    const path = `avatars/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file);
    if (error) {
      const reader = new FileReader();
      return new Promise<void>((resolve) => {
        reader.onload = () => {
          void setAvatarUrl(reader.result as string).then(() => resolve());
        };
        reader.readAsDataURL(file);
      });
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path);
    await setAvatarUrl(publicUrl);
  }

  return { setAvatarUrl, uploadAvatarFile };
}
