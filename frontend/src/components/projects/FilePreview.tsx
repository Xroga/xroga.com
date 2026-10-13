'use client';

import { useState,useEffect,useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { isPrivateFileUrl } from '@/lib/privateFileUrl';

interface FilePreviewProps {
  file: {
    id?:string;
    project_id?:string;
    file_name: string;
    file_type: string;
    file_url: string | null;
    content: string | null;
  };
}

export function FilePreview({ file }: FilePreviewProps) {
  const [error, setError] = useState(false);
  const [pending,setPending]=useState(false),[notice,setNotice]=useState(''),[temporaryLink,setTemporaryLink]=useState('');
  const url=isPrivateFileUrl(file.file_url)?file.file_url:null;
  const fileIdentity=`${file.project_id}:${file.id}:${file.file_url}`;
  const currentIdentity=useRef(fileIdentity);
  currentIdentity.current=fileIdentity;
  useEffect(()=>{setError(false);setNotice('');setTemporaryLink('');setPending(false);},[fileIdentity]);
  const linkAction=async(revoke:boolean)=>{
    if(!file.id||!file.project_id)return;
    const identity=fileIdentity;
    setPending(true);setNotice('');
    try {
      const path=`/projects/${file.project_id}/files/${file.id}`;
      if(revoke){await apiFetch(`${path}/links`,{method:'DELETE'});if(currentIdentity.current!==identity)return;setTemporaryLink('');setNotice('Timed links revoked. You still have owner access.');}
      else {
        const result=await apiFetch<{url:string}>(`${path}/link`,{method:'POST',body:JSON.stringify({expiresIn:60})});
        if(currentIdentity.current!==identity)return;
        if(!isPrivateFileUrl(result.url))throw new Error('invalid file link');
        const link=new URL(result.url,window.location.origin).href;setTemporaryLink(link);
        try{await navigator.clipboard.writeText(link);if(currentIdentity.current===identity)setNotice('60-second link copied. Only your signed-in account can open it.');}catch{if(currentIdentity.current===identity)setNotice('Copy the 60-second link below. Only your signed-in account can open it.');}
      }
    }catch{if(currentIdentity.current===identity)setNotice('File links are unavailable. Retry shortly.');}finally{if(currentIdentity.current===identity)setPending(false);}
  };

  let preview;

  if (file.file_type === 'image' && url && !error) {
    preview = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={file.file_name}
        className="max-w-full max-h-[70vh] rounded-lg object-contain"
        onError={() => setError(true)}
      />
    );
  } else if (file.file_type === 'video' && url && !error) {
    preview = (
      <video src={url} controls onError={()=>setError(true)} className="max-w-full max-h-[70vh] rounded-lg">
        <track kind="captions" />
      </video>
    );
  } else if (file.file_type === 'code' || file.content) {
    preview = (
      <pre className="p-4 rounded-lg bg-black/40 border border-[var(--card-border)] overflow-auto max-h-[70vh] text-sm font-mono">
        <code>{file.content ?? 'No preview available'}</code>
      </pre>
    );
  } else if (url && !error) {
    preview = (
      <a href={url} download className="text-violet-400 hover:underline">
        Download {file.file_name}
      </a>
    );
  } else preview=<p className="text-[var(--muted)] text-sm">Secure preview is unavailable. No public storage link is opened.</p>;
  return <div className="space-y-3">{preview}{url&&file.id&&file.project_id&&<div className="flex flex-wrap gap-2">
    <button type="button" disabled={pending} onClick={()=>void linkAction(false)} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2">Copy 60-second link</button>
    <button type="button" disabled={pending} onClick={()=>void linkAction(true)} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2">Revoke timed links</button>
  </div>}{notice&&<p role="status" className="text-sm text-[var(--muted)]">{notice}</p>}{temporaryLink&&<label className="block text-sm">Temporary owner-only link<input readOnly value={temporaryLink} className="mt-1 w-full rounded border border-[var(--card-border)] bg-transparent p-2" onFocus={event=>event.target.select()}/></label>}</div>;
}
