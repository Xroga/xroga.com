'use client';
import { useMemo,useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileCheck2, Search, Sparkles, X } from 'lucide-react';
import { NATIVE_WORK_SKILLS, nativeSkillWorkspaceHref, type NativeWorkSkill } from '@/lib/nativeWorkSkills';
import styles from './NativeSkillsDirectory.module.css';

export function NativeSkillsDirectory({
 mode, onChoose,
}: {mode:'library'|'picker';onChoose?:(skill:NativeWorkSkill)=>void}) {
 const [query,setQuery]=useState('');
 const [expanded,setExpanded]=useState<string|null>(null);
 const matches=useMemo(()=>NATIVE_WORK_SKILLS.filter(s=>(
   [s.title,s.description,s.inputs,s.deliverable].join(' ').toLowerCase().includes(query.trim().toLowerCase())
 )),[query]);
 return <div className={styles.root}>
  <div className={styles.top}><div><p className={styles.eyebrow}>READY-MADE WORK</p><h3>Choose the outcome, not the tools.</h3><p>40 substantial native work recipes. No app connections needed.</p></div><span className={styles.count}>{matches.length} / 40</span></div>
  <label className={styles.search}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search websites, leads, content, competitors…" aria-label="Search native Skills"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></button>}</label>
  <div className={styles.cards}>{matches.map(skill=><article key={skill.id} className={styles.card}>
   <div className={styles.cardHeader}><span className={styles.icon}><Sparkles size={16}/></span><span className={styles.number}>SKILL {String(NATIVE_WORK_SKILLS.indexOf(skill)+1).padStart(2,'0')}</span></div>
   <h4>{skill.title}</h4><p className={styles.description}>{skill.description}</p>
   <p className={styles.deliverable}><FileCheck2 size={14}/>{skill.deliverable}</p>
   <button type="button" aria-expanded={expanded===skill.id} className={styles.detailsButton} onClick={()=>setExpanded(expanded===skill.id?null:skill.id)}>{expanded===skill.id?'Hide details':'What you provide'}</button>
   {expanded===skill.id&&<p className={styles.inputs}>{skill.inputs}</p>}
   {mode==='library'?<Link className={styles.start} href={nativeSkillWorkspaceHref(skill.id)}>Start Work in Workspace <ArrowRight size={15}/></Link>:
   <button type="button" className={styles.start} onClick={()=>onChoose?.(skill)}>Use this Skill <ArrowRight size={15}/></button>}
  </article>)}</div>
  {!matches.length&&<p className={styles.empty}>No matching Skills. Search for a different outcome.</p>}
  <p className={styles.footnote}>Skills use your existing Xroga execution capabilities. Specialized audits and public datasets are verified at execution time; unavailable functions are reported rather than simulated.</p>
 </div>;
}
