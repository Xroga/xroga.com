'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  downloadExportedFile,
  exportDocumentDocx,
  exportDocumentPdf,
} from '@/lib/xrogaFileExports';
import type { XrogaBlock } from '@/lib/xrogaBlocks';

type DocumentBlock = Extract<XrogaBlock, { type: 'document' }>;

/** Export only the response returned by the authorized share endpoint. */
export function SharedAnswerDownloads({ response }: { response: string }) {
  const [busy, setBusy] = useState<'docx' | 'pdf' | null>(null);
  const [error, setError] = useState('');
  const document: DocumentBlock = {
    schemaVersion: 1,
    id: 'shared-answer',
    type: 'document',
    title: 'Shared Xroga answer',
    format: 'text',
    content: response,
  };

  async function download(format: 'docx' | 'pdf') {
    setBusy(format);
    setError('');
    try {
      downloadExportedFile(await (format === 'docx'
        ? exportDocumentDocx(document)
        : exportDocumentPdf(document)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The download could not be created.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 border-t border-black/10 pt-4 dark:border-white/10">
      <p className="mb-2 text-xs font-medium text-black/55 dark:text-white/55">Download this answer</p>
      <div className="flex flex-wrap gap-2">
        {(['docx', 'pdf'] as const).map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => void download(format)}
            disabled={busy !== null}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-black/15 px-3 text-xs font-medium transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            <Download size={14} aria-hidden="true" />
            {busy === format ? 'Preparing…' : format.toUpperCase()}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
