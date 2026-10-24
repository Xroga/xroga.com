'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ProjectFile } from '@/lib/api';
import { isPrivateFileUrl } from '@/lib/privateFileUrl';
import { FilePreview } from '@/components/projects/FilePreview';

const safeFileUrl = (value: string | null) => { if (!value) return null; try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

/** Reuse the existing owner-only delivery controls in the current Library. */
export function LibraryFilePreview({ projectId, file }: { projectId: string; file: ProjectFile }) {
  const content = file.content ? file.content.slice(0, 5000) + (file.content.length > 5000 ? '\n… Preview limited to 5,000 characters' : '') : null;
  const privateUrl = isPrivateFileUrl(file.file_url)
    && file.file_url.split('?')[0] === `/api/private-files/${projectId}/${file.id}` ? file.file_url : null;
  const externalUrl = safeFileUrl(file.file_url);
  if (privateUrl) return <>
    <a href={privateUrl} download>Download selected file</a>
    <FilePreview key={`${projectId}:${file.id}`} file={{ ...file, project_id: projectId, content }} />
  </>;
  return <>
    {content ? <pre>{content}</pre> : <p>No inline preview is stored for this file.</p>}
    {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer">Open saved file <ArrowUpRight size={14} /></a>}
  </>;
}
