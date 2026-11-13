"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X, PlugZap, CheckCircle2 } from "lucide-react";
import { PluginBrandLogo } from "@/components/integrations/PluginBrandLogo";
import { curatedWorkPacks, curatedAppNames, type CuratedWorkPack } from "./workPacksV2";
import styles from "./WorkPacksGallery.module.css";

export function WorkPacksGallery({onSelect,initialId}:{onSelect:(text:string,label:string)=>void;initialId?:string}) {
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState<CuratedWorkPack|null>(()=>curatedWorkPacks.find(p=>p.id===initialId)||null);
 const detail=useRef<HTMLDivElement>(null);
 useEffect(()=>{const p=curatedWorkPacks.find(x=>x.id===initialId);if(p)setSelected(p);},[initialId]);
 const results=useMemo(()=>curatedWorkPacks.filter(p=>[p.title,p.description,...p.requiredApps.map(x=>curatedAppNames[x]||x)].join(" ").toLowerCase().includes(query.trim().toLowerCase())),[query]);
 function open(p:CuratedWorkPack){setSelected(p);window.history.replaceState(null,"",`#work-packs/${p.id}`);requestAnimationFrame(()=>detail.current?.scrollIntoView({behavior:"smooth",block:"start"}));}
 function submitPack(p:CuratedWorkPack){onSelect(`I want to use the Xroga Work Pack "${p.title}". Outcome: ${p.description} Preferred app toolkits: ${p.requiredApps.map(x=>curatedAppNames[x]||x).join(", ")}. First check the actual connected accounts and available Composio tools. Ask me to connect missing required apps. Determine the exact workflow from my instructions; show the plan, required permissions and any provider-plan limitations. Use Xroga's existing scheduler; request explicit approval before any external write, send, publish, payment or production change. Execute only authorized supported actions, verify each result and report any unsupported step truthfully.`,p.title);}
 return <section className={styles.gallery} aria-label="Work Packs">
  <div className={styles.head}><div><p className={styles.kicker}>Ready-made outcomes</p><h2>Work Packs</h2><p>Choose the work. Connect the apps you need. Finish it with Xroga.</p></div><span className={styles.count}>50 Work Packs</span></div>
  <label className={styles.search}><Search size={16} aria-hidden="true"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search work, apps or outcomes…" aria-label="Search Work Packs"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><X size={15}/></button>}</label>
  <p className={styles.helper}>{results.length} of 50 outcomes · No app-count limit · Connections managed in Xroga</p>
  <div className={styles.cards}>{results.map(p=><article key={p.id} className={styles.card}><div className={styles.cardHeading}><h3>{p.title}</h3><span>{p.requiredApps.length} {p.requiredApps.length===1?"app":"apps"}</span></div><p className={styles.description}>{p.description}</p><div className={styles.appRow}>{p.requiredApps.map(app=><span className={styles.app} key={app}><PluginBrandLogo id={app} toolkit={app} name={curatedAppNames[app]||app} size="micro"/><span>{curatedAppNames[app]||app}</span></span>)}</div><button type="button" className={styles.explore} onClick={()=>open(p)}>Set up Work Pack <ArrowRight size={15}/></button></article>)}</div>
  {!results.length&&<p className={styles.empty}>No Work Packs match. Try another task or application name.</p>}
  {selected&&<div ref={detail} className={styles.detail} aria-label="Selected Work Pack"><div className={styles.detailTop}><div><p className={styles.kicker}>Guided setup</p><h3>{selected.title}</h3><p>{selected.description}</p></div><button type="button" aria-label="Close setup" className={styles.close} onClick={()=>{setSelected(null);window.history.replaceState(null,"","#work-packs");}}><X size={18}/></button></div><p className={styles.required}>Apps for this outcome · Select any app to review or connect it using Xroga&apos;s existing integrations.</p><div className={styles.connectionList}>{selected.requiredApps.map(app=><div className={styles.connection} key={app}><PluginBrandLogo id={app} toolkit={app} name={curatedAppNames[app]||app} size="card"/><span>{curatedAppNames[app]||app}</span><Link href={`/dashboard/integrations/${app}`}>Connect / manage <ArrowRight size={14}/></Link></div>)}</div><div className={styles.disclaimer}><CheckCircle2 size={16}/><span>Connections and actual actions are checked when you start. Selecting a pack does not authorize publishing, sending, spending or making changes.</span></div><div className={styles.actions}><Link href="/dashboard/integrations" className={styles.secondary}><PlugZap size={16}/> All integrations</Link><button className={styles.primary} type="button" onClick={()=>submitPack(selected)}>Use in Xroga chat <ArrowRight size={16}/></button></div></div>}
 </section>;
}
