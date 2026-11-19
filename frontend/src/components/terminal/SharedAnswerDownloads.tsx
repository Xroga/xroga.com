'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  downloadExportedFile,
  exportDocumentDocx,
  exportDocumentPdf,
} from '@/lib/xrogaFileExports';
import type { XrogaBlock } from '@/lib/xrogaBlocks';
import type { NativeDocumentFormat } from '../../../../backend/src/ai/nativeDocumentDownload';

type DocumentBlock = Extract<XrogaBlock, { type: 'document' }>;

type AnswerDownloadProps = {
  response: string;
  requestedFormat?: NativeDocumentFormat;
  verifiedLinks: readonly string[];
};

/** Generate the actual file on demand from the authorized answer shown on this page. */
export function SharedAnswerDownloads({ response, requestedFormat, verifiedLinks }: AnswerDownloadProps) {
  const [busy, setBusy] = useState<NativeDocumentFormat | null>(null);
  const [error, setError] = useState('');
  const heading = /^#{1,3}[ \t]+([^\r\n]+)/m.exec(response)?.[1]?.trim();
  const document: DocumentBlock = {
    schemaVersion: 1,
    id: 'shared-answer',
    type: 'document',
    title: requestedFormat ? (heading?.slice(0, 100) || 'Xroga document') : 'Shared Xroga answer',
    format: 'text',
    content: response,
  };

  async function download(format: NativeDocumentFormat) {
    setBusy(format);
    setError('');
    try {
      downloadExportedFile(await (format === 'docx'
        ? exportDocumentDocx(document, new Set(verifiedLinks))
        : exportDocumentPdf(document)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The download could not be created.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={requestedFormat ? 'mt-3' : 'mt-5 border-t border-black/10 pt-4 dark:border-white/10'}>
      {!requestedFormat && <p className="mb-2 text-xs font-medium text-black/55 dark:text-white/55">Download this answer</p>}
      <div className="flex flex-wrap gap-2">
        {(requestedFormat ? [requestedFormat] : ['docx', 'pdf'] as const).map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => void download(format)}
            disabled={busy !== null}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-black/15 px-3 text-xs font-medium transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            <Download size={14} aria-hidden="true" />
            {busy === format ? 'Preparing…' : requestedFormat ? `Download ${format.toUpperCase()}` : format.toUpperCase()}
          </button>
        ))}
      </div>
      {requestedFormat && <p className="mt-1 text-xs text-[var(--muted)]">Generated on this device when you download.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
