/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set only for unattended development runs (fixtures/autorun.mjs). */
  readonly WXT_AUTORUN_URL?: string;
  readonly WXT_AUTORUN_PRODUCT?: string;
  readonly VITE_POSTHOG_API_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Xroga modification: WXT resolves the worker for the selected build.
declare module '@xroga/runtime-background';
