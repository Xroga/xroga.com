'use client';
import {useEffect,useRef,useState,type CSSProperties,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {Archive,ArrowDown,ArrowUp,Check,ChevronLeft,Copy,ExternalLink,FolderInput,FolderPlus,Pencil,Pin,PinOff,Share2,Trash2,X} from 'lucide-react';
import type {Project} from '@/lib/api';
import type {SidebarSection} from '@/lib/sidebarOrganization';
export function SidebarRevealTitle({text}:{text:string}){
  const frame=useRef<HTMLSpanElement>(null), label=useRef<HTMLSpanElement>(null);
  const [overflow,setOverflow]=useState(0);
  useEffect(()=>{
    const update=()=>setOverflow(Math.max(0,(label.current?.scrollWidth||0)-(frame.current?.clientWidth||0)));
    update();
    const obs=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    if(frame.current)obs?.observe(frame.current);if(label.current)obs?.observe(label.current);
    return()=>obs?.disconnect();
  },[text]);
  return <span ref={frame} className="xv-so-title" aria-label={text}><span ref={label}
    data-overflow={overflow>2} style={{'--so-slide':`-${overflow}px`,'--so-time':`${Math.min(6,Math.max(1.2,overflow/38))}s`} as CSSProperties}>{text}</span></span>;
}
export type SidebarMenuTarget={kind:'conversation'|'project';id:string;label:string;pinned:boolean;projectId?:string|null};
export type SidebarMenuProps={
  target:SidebarMenuTarget|null;point:{x:number;y:number}|null;trigger:RefObject<HTMLElement|null>;
  projects:Project[];sections:SidebarSection[];close:()=>void;
  pin:(t:SidebarMenuTarget)=>Promise<void>;rename:(t:SidebarMenuTarget,name:string)=>Promise<void>;
  move:(t:SidebarMenuTarget,projectId:string|null,sectionId?:string|null)=>Promise<void>;
  createProject:(name:string)=>Promise<Project>;createSection:(projectId:string,name:string)=>Promise<SidebarSection>;
  archive:(t:SidebarMenuTarget)=>Promise<void>;remove:(t:SidebarMenuTarget)=>Promise<void>;
  copy:(t:SidebarMenuTarget)=>Promise<void>;openTab:(t:SidebarMenuTarget)=>void;
  share:(t:SidebarMenuTarget)=>void;reorder:(t:SidebarMenuTarget,direction:-1|1)=>Promise<void>;
};
export function SidebarOrganizerMenu(p:SidebarMenuProps){
  const {target,point,trigger,close}=p;
  const ref=useRef<HTMLDivElement>(null);
  const [step,setStep]=useState<'main'|'rename'|'move'|'section'|'newProject'|'newSection'>('main');
  const [value,setValue]=useState(''),[chosenProject,setChosenProject]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [pos,setPos]=useState({left:8,top:8});
  const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{setStep('main');setValue('');setChosenProject(target?.projectId||'');setError('');},[target?.id,target?.kind,target?.projectId]);
  useEffect(()=>{
    if(!target||!point)return;
    const align=()=>setPos({left:Math.max(8,Math.min(point.x,innerWidth-(ref.current?.offsetWidth||240)-8)),
      top:Math.max(8,Math.min(point.y,innerHeight-(ref.current?.offsetHeight||330)-8))});
    const handle=requestAnimationFrame(align);
    window.addEventListener('resize',align);
    const scrolled=()=>closeRef.current();
    window.addEventListener('scroll',scrolled,true);
    return()=>{cancelAnimationFrame(handle);window.removeEventListener('resize',align);window.removeEventListener('scroll',scrolled,true);};
  },[target,point,step]);
  useEffect(()=>{
    if(!target)return;
    const pointer=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))closeRef.current();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();closeRef.current();trigger.current?.focus();}};
    document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);};
  },[target,trigger]);
  if(!target||!point||typeof document==='undefined')return null;
  const run=async(action:()=>Promise<unknown>)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await action();close();}
    catch(e){setError(e instanceof Error?e.message:'Action failed. Please retry.');}
    finally{setBusy(false);}
  };
  const item=(name:string,icon:React.ReactNode,action:()=>void,destructive=false)=>
    <button type="button" key={name} role="menuitem" className={`xv-so-action ${destructive?'is-danger':''}`}
      disabled={busy} onClick={action}>{icon}<span>{name}</span></button>;
  return createPortal(<div className="xv-so-menu" role="menu" aria-label={`${target.label} actions`}
    ref={ref} style={{left:pos.left,top:pos.top}}>
    <div className="xv-so-menu-head"><strong>{step==='main'?'Manage':step==='rename'?'Rename':step==='move'?'Move to project':step==='section'?'Move to section':step==='newProject'?'New project':'New section'}</strong>
      <button type="button" aria-label="Close menu" onClick={close}><X size={15}/></button></div>
    {step!=='main'?<button className="xv-so-back" onClick={()=>setStep(step==='newProject'?'move':step==='newSection'?'section':'main')}><ChevronLeft size={14}/> Back</button>:null}
    {step==='main'?<>
      {item('Share',<Share2 size={15}/>,()=>p.share(target))}
      {item('Copy private link',<Copy size={15}/>,()=>void run(()=>p.copy(target)))}
      {item('Open in new tab',<ExternalLink size={15}/>,()=>{p.openTab(target);close();})}
      {item('Rename',<Pencil size={15}/>,()=>{setValue(target.label);setStep('rename');})}
      {item(target.pinned?'Unpin':'Pin',target.pinned?<PinOff size={15}/>:<Pin size={15}/>,()=>void run(()=>p.pin(target)))}
      {target.pinned?item('Move pin up',<ArrowUp size={15}/>,()=>void run(()=>p.reorder(target,-1))):null}
      {target.pinned?item('Move pin down',<ArrowDown size={15}/>,()=>void run(()=>p.reorder(target,1))):null}
      {target.kind==='conversation'?<>
        {item('Move to project',<FolderInput size={15}/>,()=>setStep('move'))}
        {item('Move to section',<FolderPlus size={15}/>,()=>setStep('section'))}
      </>:null}
      <hr/>
      {item('Archive',<Archive size={15}/>,()=>void run(()=>p.archive(target)))}
      {item('Delete',<Trash2 size={15}/>,()=>void run(()=>p.remove(target)),true)}
    </>:null}
    {['rename','newProject','newSection'].includes(step)?<form onSubmit={e=>{
      e.preventDefault();const name=value.trim();if(!name)return;
      if(step==='rename')void run(()=>p.rename(target,name));
      else if(step==='newProject')void run(async()=>{const project=await p.createProject(name);await p.move(target,project.id,null);});
      else void run(async()=>{if(!chosenProject)throw new Error('Choose project');const s=await p.createSection(chosenProject,name);await p.move(target,chosenProject,s.id);});
    }}><input aria-label="Name" autoFocus maxLength={120} value={value} onChange={e=>setValue(e.target.value)}/>
      <button type="submit" disabled={!value.trim()||busy}><Check size={14}/>Save</button></form>:null}
    {step==='move'?<div className="xv-so-choices">
      <button onClick={()=>void run(()=>p.move(target,null,null))}>No project (Recents)</button>
      {p.projects.map(project=><button key={project.id} onClick={()=>void run(()=>p.move(target,project.id,null))}>{project.name}</button>)}
      <button onClick={()=>{setValue('');setStep('newProject');}}><FolderPlus size={14}/> New project</button>
    </div>:null}
    {step==='section'?<div className="xv-so-choices">
      <select aria-label="Choose project" value={chosenProject} onChange={e=>setChosenProject(e.target.value)}>
        <option value="">Choose project</option>{p.projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select>
      {chosenProject?<>
        <button onClick={()=>void run(()=>p.move(target,chosenProject,null))}>Without section</button>
        {p.sections.filter(s=>s.project_id===chosenProject).map(s=><button key={s.id} onClick={()=>void run(()=>p.move(target,chosenProject,s.id))}>{s.name}</button>)}
        <button onClick={()=>{setValue('');setStep('newSection');}}><FolderPlus size={14}/> New section</button>
      </>:null}
    </div>:null}
    {error?<p className="xv-so-error" role="alert">{error}</p>:null}
  </div>,document.body);
}
