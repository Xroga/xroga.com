import Link from 'next/link';
import { ArrowLeft, LockKeyhole } from 'lucide-react';

export default function OsPreviewAccessDenied() {
  return <main className="os-preview" style={{ display: 'grid', placeItems: 'center', padding: 24 }}><div className="os-panel" style={{ maxWidth: 450, width: '100%' }}><LockKeyhole size={25} aria-hidden="true" /><h1 style={{ fontSize: 27, letterSpacing: '-.04em', margin: '14px 0' }}>Access unavailable</h1><p>This area is restricted. If you believe you should have access, check your account security settings or contact your administrator.</p><Link className="os-button" href="/os-preview"><ArrowLeft size={15} /> Return to preview</Link></div></main>;
}
