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
  /** Legacy flags — Xroga does not train models; kept for persisted store compatibility */
  trainForPersonalUse: boolean;
  /** Legacy flags — unused */
  improveModelForEveryone: boolean;
  setIncognito: (v: boolean) => void;
  setAllowPersonalInfo: (v: boolean) => void;
  setUseRandomDisplayName: (v: boolean) => void;
  setRememberIp: (v: boolean) => void;
  setCrossProjectAccess: (v: boolean) => void;
  setXrogaAutoMode: (v: boolean) => void;
  setConfirmationMode: (v: ConfirmationMode) => void;
  setTrainForPersonalUse: (v: boolean) => void;
  setImproveModelForEveryone: (v: boolean) => void;
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
      confirmationMode: 'auto',
      trainForPersonalUse: true,
      improveModelForEveryone: false,
      setIncognito: (incognito) => set({ incognito }),
      setAllowPersonalInfo: (allowPersonalInfo) => set({ allowPersonalInfo }),
      setUseRandomDisplayName: (useRandomDisplayName) => set({ useRandomDisplayName }),
      setRememberIp: (rememberIp) => set({ rememberIp }),
      setCrossProjectAccess: (crossProjectAccess) => set({ crossProjectAccess }),
      setXrogaAutoMode: (xrogaAutoMode) => set({ xrogaAutoMode }),
      setConfirmationMode: (confirmationMode) => set({ confirmationMode }),
      setTrainForPersonalUse: (trainForPersonalUse) => set({ trainForPersonalUse }),
      setImproveModelForEveryone: (improveModelForEveryone) => set({ improveModelForEveryone }),
    }),
    { name: 'xroga-privacy-v1' }
  )
);
