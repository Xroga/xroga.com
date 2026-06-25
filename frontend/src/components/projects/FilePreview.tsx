'use client';

import { useState } from 'react';

interface FilePreviewProps {
  file: {
    file_name: string;
    file_type: string;
    file_url: string | null;
    content: string | null;
  };
}

export function FilePreview({ file }: FilePreviewProps) {
  const [error, setError] = useState(false);

  if (file.file_type === 'image' && file.file_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.file_url}
        alt={file.file_name}
        className="max-w-full max-h-[70vh] rounded-lg object-contain"
        onError={() => setError(true)}
      />
    );
  }

  if (file.file_type === 'video' && file.file_url) {
    return (
      <video src={file.file_url} controls className="max-w-full max-h-[70vh] rounded-lg">
        <track kind="captions" />
      </video>
    );
  }

  if (file.file_type === 'pdf' && file.file_url) {
    return (
      <iframe
        src={file.file_url}
        title={file.file_name}
        className="w-full h-[70vh] rounded-lg border border-[var(--card-border)]"
      />
    );
  }

  if (file.file_type === 'code' || file.content) {
    return (
      <pre className="p-4 rounded-lg bg-black/40 border border-[var(--card-border)] overflow-auto max-h-[70vh] text-sm font-mono">
        <code>{file.content ?? 'No preview available'}</code>
      </pre>
    );
  }

  if (file.file_url && !error) {
    return (
      <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">
        Open {file.file_name}
      </a>
    );
  }

  return <p className="text-[var(--muted)] text-sm">Preview not available</p>;
}
