'use client';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export function SidebarMovingTitle({text}:{text:string}){
 const viewport=useRef<HTMLSpanElement>(null);const content=useRef<HTMLSpanElement>(null);
 const [overflow,setOverflow]=useState(0);const [hovered,setHovered]=useState(false);
 const enter=()=>{
  if(!viewport.current||!content.current)return;
  const distance=Math.ceil(content.current.scrollWidth-viewport.current.clientWidth);
  setOverflow(Math.max(0,distance));setHovered(true);
 };
 return <span ref={viewport} className="xv-sidebar-long-title" onMouseEnter={enter}
  onMouseLeave={()=>setHovered(false)} onFocus={enter} onBlur={()=>setHovered(false)}
  aria-label={text} style={{display:'block',minWidth:0,overflow:'hidden',whiteSpace:'nowrap',width:'100%'}}>
   <span ref={content} className={overflow>0&&hovered?'xv-sidebar-long-title--scroll':''}
    style={{display:'inline-block',maxWidth:hovered?'none':'100%',overflow:hovered?'visible':'hidden',textOverflow:hovered?'clip':'ellipsis',whiteSpace:'nowrap',
     transform:!hovered?'translateX(0)':undefined,
     '--sidebar-title-overflow':`-${overflow}px`,
     '--sidebar-title-duration':`${Math.max(1.2,Math.min(5.5,overflow/24))}s`} as CSSProperties}
   >{text}</span>
  </span>;
}
