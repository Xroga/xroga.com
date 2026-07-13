'use client';

import { storageBootstrapScript } from '@/lib/storageBootstrapScript';

export function StorageBootstrap() {
  return <script dangerouslySetInnerHTML={{ __html: storageBootstrapScript() }} />;
}
