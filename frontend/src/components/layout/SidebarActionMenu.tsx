'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowDown, ArrowUp, Copy, ExternalLink, FolderInput, FolderPlus, Pencil, Pin, PinOff, Share2, Trash2, X } from 'lucide-react';

export type SidebarActionId='share'|'copy'|'open'|'rename'|'pin'|'move-project'|'move-section'|'archive'|'delete'|'pin-up'|'pin-down';
export type SidebarMenuAction={id:SidebarActionId;label:string;disabled?:boolean;danger?:boolean};
const Icons={
 share:Share2,copy:Copy,open:ExternalLink,rename:Pencil,pin:Pin,
 'move-project':FolderInput,'move-section':FolderPlus,archive:Archive,delete:Trash2,
 'pin-up':ArrowUp,'pin-down':ArrowDown,
} as const;
export function SidebarActionMenu({point,actions,onClose,onSelect}:{
 point:{x:number;y:number}|null;
 actions:SidebarMenuAction[];
 onClose:()=>void;onSelect:(action:SidebarActionId)=>void;
}){
 const menu=useRef<HTMLDivElement>(null);
 const [pos,setPos]=useState({left:12,top:12});
 useLayoutEffect(()=>{
  if(!point||!menu.current)return;
  const box=menu.current.getBoundingClientRect();
  const width=Math.min(box.width,window.innerWidth-24);
  const height=Math.min(box.height,window.innerHeight-24);
  setPos({left:Math.max(12,Math.min(point.x,window.innerWidth-width-12)),
   top:Math.max(12,Math.min(point.y,window.innerHeight-height-12))});
  menu.current.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({preventScroll:true});
 },[point,actions.length]);
 useEffect(()=>{
  if(!point)return;
  const pointer=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))onClose();};
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();onClose();}
   if((event.key==='ArrowDown'||event.key==='ArrowUp')&&menu.current){
    event.preventDefault();
    const options=Array.from(menu.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const index=options.indexOf(document.activeElement as HTMLButtonElement);
    options[(index+(event.key==='ArrowDown'?1:options.length-1))%options.length]?.focus();
   }
  };
  document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);
  window.addEventListener('scroll',onClose,true);window.addEventListener('resize',onClose);
  return()=>{document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);
    window.removeEventListener('scroll',onClose,true);window.removeEventListener('resize',onClose);};
 },[point,onClose]);
 if(!point||typeof document==='undefined')return null;
 return createPortal(<div ref={menu} role="menu" aria-label="Organize saved work"
  className="xv-sidebar-work-menu" style={{position:'fixed',left:pos.left,top:pos.top,
   width:'min(238px,calc(100vw - 24px))',maxHeight:'calc(100dvh - 24px)',overflowY:'auto',
   zIndex:10030,background:'var(--card)',color:'var(--foreground)',
   border:'1px solid var(--card-border)',borderRadius:12,padding:5,
   boxShadow:'0 14px 42px rgba(0,0,0,.24)',overscrollBehavior:'contain'}}>
  {actions.map(action=>{
   const Icon=action.id==='pin'&&action.label.startsWith('Unpin')?PinOff:Icons[action.id];
   return <button type="button" role="menuitem" key={action.id} disabled={action.disabled}
     onClick={()=>onSelect(action.id)}
     className="xv-sidebar-work-menu__action"
     style={{display:'flex',alignItems:'center',gap:10,width:'100%',padding:'9px 11px',
      fontSize:12,textAlign:'left',borderRadius:8,color:action.danger?'var(--destructive,#f66)':'inherit',
      opacity:action.disabled?.45:1}}>
      <Icon size={15} aria-hidden="true"/><span>{action.label}</span>
     </button>;
  })}
  <button type="button" aria-label="Close menu" className="sr-only" onClick={onClose}><X size={14}/></button>
 </div>,document.body);
}
