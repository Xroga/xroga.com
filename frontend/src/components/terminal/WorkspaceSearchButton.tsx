'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { SidebarSearchModal } from '@/components/layout/SidebarSearchModal';
import styles from './WorkspaceControls.module.css';

export function WorkspaceSearchButton() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={styles.workspaceSearch} onClick={() => setOpen(true)} aria-label="Search workspace"><Search size={13} /><span>Search…</span></button>
    <SidebarSearchModal open={open} onClose={() => setOpen(false)} />
  </>;
}
