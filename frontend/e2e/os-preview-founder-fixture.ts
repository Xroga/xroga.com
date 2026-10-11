import { test } from '@playwright/test';

/** These interaction suites need a separately provisioned, AAL2 TEST founder session. */
export function requireFounderPreviewSession() {
  const state = process.env.OS_PREVIEW_FOUNDER_STORAGE_STATE;
  test.use({ storageState: state ?? { cookies: [], origins: [] } });
  test.beforeEach(() => {
    test.skip(!state, 'Founder-only preview interaction tests need an isolated TEST founder AAL2 storage state.');
  });
}
