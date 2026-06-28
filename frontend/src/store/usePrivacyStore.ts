'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ConfirmationMode = 'manual' | 'auto';

interface PrivacyState {
  incognito: boolean;
  allowPersonalInfo: boolean;
  useRandomDisplayName: boolean;
  rememberIp: boolean;
  crossProjectAccess: boolean;
  xrogaAutoMode: boolean;
  confirmationMode: ConfirmationMode;
  setIncognito: (v: boolean) => void;
  setAllowPersonalInfo: (v: boolean) => void;
  setUseRandomDisplayName: (v: boolean) => void;
  setRememberIp: (v: boolean) => void;
  setCrossProjectAccess: (v: boolean) => void;
  setXrogaAutoMode: (v: boolean) => void;
  setConfirmationMode: (v: ConfirmationMode) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      incognito: false,
      allowPersonalInfo: false,
      useRandomDisplayName: true,
      rememberIp: false,
      crossProjectAccess: false,
      xrogaAutoMode: true,
      confirmationMode: 'manual',
      setIncognito: (incognito) => set({ incognito }),
      setAllowPersonalInfo: (allowPersonalInfo) => set({ allowPersonalInfo }),
      setUseRandomDisplayName: (useRandomDisplayName) => set({ useRandomDisplayName }),
      setRememberIp: (rememberIp) => set({ rememberIp }),
      setCrossProjectAccess: (crossProjectAccess) => set({ crossProjectAccess }),
      setXrogaAutoMode: (xrogaAutoMode) => set({ xrogaAutoMode }),
      setConfirmationMode: (confirmationMode) => set({ confirmationMode }),
    }),
    { name: 'xroga-privacy-v1' }
  )
);
