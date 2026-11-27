'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useHydrated } from '@/hooks/useHydrated';
import {
  downloadExportedFile,
  exportAnswerFile,
  PdfUnsupportedCharactersError,
} from '@/lib/xrogaFileExports';
import type { NativeDocumentFormat } from '../../../../backend/src/ai/nativeDocumentDownload';

type AnswerDownloadProps = {
  response: string;
  requestedFormat?: NativeDocumentFormat;
  verifiedLinks: readonly string[];
};

/** Generate the actual file on demand from the authorized answer shown on this page. */
export function SharedAnswerDownloads({ response, requestedFormat, verifiedLinks }: AnswerDownloadProps) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<NativeDocumentFormat | null>(null);
  const [error, setError] = useState('');
  const [needsDocx, setNeedsDocx] = useState(false);
  const formats: readonly NativeDocumentFormat[] = requestedFormat && !(requestedFormat === 'pdf' && needsDocx)
    ? [requestedFormat] : ['docx', 'pdf'];

  async function download(format: NativeDocumentFormat) {
    setBusy(format);
    setError('');
    try {
      downloadExportedFile(await exportAnswerFile(response, format, new Set(verifiedLinks), !requestedFormat));
    } catch (cause) {
      if (cause instanceof PdfUnsupportedCharactersError) setNeedsDocx(true);
      setError(cause instanceof Error ? cause.message : 'The download could not be created.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={requestedFormat ? 'mt-3' : 'mt-5 border-t border-black/10 pt-4 dark:border-white/10'}>
      {!requestedFormat && <p className="mb-2 text-xs font-medium text-black/55 dark:text-white/55">Download this answer</p>}
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => void download(format)}
            disabled={!hydrated || busy !== null}
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
