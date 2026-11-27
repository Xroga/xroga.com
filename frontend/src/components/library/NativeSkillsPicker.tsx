'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { NativeSkillsDirectory } from './NativeSkillsDirectory';
import type { NativeWorkSkill } from '@/lib/nativeWorkSkills';
import styles from './NativeSkillsPicker.module.css';

export function NativeSkillsPicker({open,onClose,onChoose}:{open:boolean;onClose:()=>void;onChoose:(skill:NativeWorkSkill)=>void}) {
 useEffect(()=>{
  if(!open)return;
  const listener=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
  window.addEventListener('keydown',listener);
  return()=>window.removeEventListener('keydown',listener);
 },[open,onClose]);
 if(!open||typeof document==='undefined')return null;
 return createPortal(<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Choose a native Xroga Skill">
   <div className={styles.head}><div><strong>Skills</strong><span>Start complete work from the current Workspace chat</span></div><button onClick={onClose} type="button" aria-label="Close Skills"><X size={18}/></button></div>
   <div className={styles.body}><NativeSkillsDirectory mode="picker" onChoose={onChoose}/></div>
  </div>
 </div>,document.body);
}
