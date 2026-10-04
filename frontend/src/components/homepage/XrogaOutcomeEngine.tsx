'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { autocorrectText } from '@/lib/chatSuggestions';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowRight, Paperclip, PlugZap, Search, Users, Mail, Headphones,
  Code2, BarChart3, Megaphone, Workflow, ShoppingBag, Rocket, ShieldCheck,
  Check, Play, Database, GitBranch, Smartphone, Globe2, LockKeyhole,
} from 'lucide-react';
import '@/styles/outcome-engine.css';

type Problem = { name: string; hint: string; prompt: string; icon: React.ReactNode };
type AppNode = { name: string; slug: string; category: string; connected?: boolean };
type Step = { label: string; detail: string; approval?: boolean };
type Scenario = { kicker: string; title: string; description: string; steps: Step[] };

const problems: Problem[] = [
  { name:'Research', icon:<Search/>, hint:'Compare markets, news, companies or competitors.', prompt:'Research our competitors, compare pricing, positioning and recent launches, then create an executive brief.' },
  { name:'Lead generation', icon:<Users/>, hint:'Find and qualify the right prospects.', prompt:'Find 50 dental clinics in Dubai, qualify the strongest prospects, draft personalized outreach and add them to my CRM.' },
  { name:'Sales outreach', icon:<Mail/>, hint:'Research, personalize, approve, send.', prompt:'Research these prospects, prepare personalized outreach, pause for approval, then send through my connected email account.' },
  { name:'Customer support', icon:<Headphones/>, hint:'Turn complaints into fixes and follow-up.', prompt:'Find our most common support complaints this week, group the root causes and create follow-up actions for each owner.' },
  { name:'Software', icon:<Code2/>, hint:'Build, change, debug, test and deploy.', prompt:'Fix the checkout bug in my repository, reproduce it, test the fix, open a PR and deploy a preview.' },
  { name:'Data & reporting', icon:<BarChart3/>, hint:'Pull data together and explain what changed.', prompt:'Pull this week’s sales, product and support data, identify the biggest changes and create a concise operating report.' },
  { name:'Marketing', icon:<Megaphone/>, hint:'Research, create and coordinate campaigns.', prompt:'Research our category, identify three campaign angles and prepare a launch plan across email, social and landing-page updates.' },
  { name:'Operations', icon:<Workflow/>, hint:'Move work across calendars, files and systems.', prompt:'Review our open operational tasks, identify blockers, update owners and prepare tomorrow’s priority plan.' },
  { name:'Commerce', icon:<ShoppingBag/>, hint:'Work across payments, orders and customers.', prompt:'Check failed Stripe payments from this week, identify affected customers and prepare follow-up actions.' },
  { name:'Deploy & publish', icon:<Rocket/>, hint:'Test, verify, ship and submit.', prompt:'Build my mobile app, test the main flows, capture store screenshots and prepare iOS and Android submissions.' },
];

const apps: AppNode[] = [
 ['Gmail','gmail','Communication'],['Google Calendar','googlecalendar','Productivity'],['Google Drive','googledrive','Productivity'],['Google Sheets','googlesheets','Data'],['Slack','slack','Communication'],['Microsoft Teams','microsoftteams','Communication'],['Outlook','microsoftoutlook','Communication'],['GitHub','github','Developer'],['GitLab','gitlab','Developer'],['Vercel','vercel','Developer'],['Supabase','supabase','Developer'],['Notion','notion','Productivity'],['Linear','linear','Productivity'],['Jira','jira','Productivity'],['Asana','asana','Productivity'],['Trello','trello','Productivity'],['Stripe','stripe','Commerce'],['Shopify','shopify','Commerce'],['HubSpot','hubspot','Sales'],['Salesforce','salesforce','Sales'],['Airtable','airtable','Data'],['Discord','discord','Communication'],['Dropbox','dropbox','Productivity'],['OneDrive','microsoftonedrive','Productivity'],['Figma','figma','Developer'],['Canva','canva','Marketing'],['Zendesk','zendesk','Support'],['Intercom','intercom','Support'],['Mailchimp','mailchimp','Marketing'],['Twilio','twilio','Communication'],['Cloudflare','cloudflare','Developer'],['PostgreSQL','postgresql','Data'],['OpenAI','openai','Research'],['Anthropic','anthropic','Research'],['Google AI','google','Research'],['Apollo','apollo','Sales'],['Attio','attio','Sales'],['Amplitude','amplitude','Data'],['PostHog','posthog','Data'],['Sentry','sentry','Developer'],['Datadog','datadog','Developer'],['Resend','resend','Communication'],['Zoom','zoom','Communication'],['Calendly','calendly','Productivity'],['Typeform','typeform','Marketing'],['Webflow','webflow','Marketing'],['WordPress','wordpress','Marketing'],['AWS','amazonwebservices','Developer'],['Google Cloud','googlecloud','Developer'],['Azure','microsoftazure','Developer'],['Custom MCP','modelcontextprotocol','Custom'],['Custom API','fastapi','Custom'],['Internal tool','tools','Custom'],
].map((a,i)=>({name:a[0],slug:a[1],category:a[2],connected:i<7||['GitHub','Vercel','Supabase'].includes(a[0])}));

const categories = ['All','Communication','Sales','Marketing','Developer','Data','Commerce','Productivity','Support','Research','Custom'];

const scenarios: Record<string, Scenario> = {
  Business:{kicker:'BUSINESS',title:'Find qualified prospects and start outreach.',description:'Research candidates, enrich and qualify them, prepare personalized drafts, pause for approval, then update the CRM.',steps:[
    {label:'Web search',detail:'Find candidate companies from current sources.'},{label:'Company research',detail:'Check websites and public context.'},{label:'Enrichment',detail:'Add useful firmographic data.'},{label:'Qualification',detail:'Score against your criteria.'},{label:'Personalize',detail:'Prepare outreach drafts.'},{label:'Approval',detail:'Human approval is required before sending.',approval:true},{label:'Outreach',detail:'Use the connected channel only after approval.'},{label:'CRM update',detail:'Record the outcome and next step.'}
  ]},
  Research:{kicker:'RESEARCH',title:'Find promising builders from today’s crypto ecosystem.',description:'Search fresh sources, cross-check builders and projects, validate evidence and return a ranked research brief.',steps:[
    {label:'Web',detail:'Search fresh public sources.'},{label:'X',detail:'Search where the authorized API allows.'},{label:'GitHub',detail:'Inspect relevant repositories.'},{label:'Hackathons',detail:'Review public project sources.'},{label:'Extract',detail:'Match builders to projects.'},{label:'Validate',detail:'Cross-check claims and evidence.'},{label:'Report',detail:'Produce a ranked, sourced brief.'}
  ]},
  Software:{kicker:'SOFTWARE',title:'Fix checkout and deploy.',description:'Inspect the repository, reproduce the issue, make the change, run checks, verify in a browser and create a preview deployment.',steps:[
    {label:'GitHub',detail:'Inspect repository and conventions.'},{label:'Reproduce',detail:'Confirm the checkout failure.'},{label:'Implement',detail:'Modify the relevant files.'},{label:'Typecheck',detail:'Run static checks.'},{label:'Tests',detail:'Run the project test suite.'},{label:'Browser',detail:'Verify the flow visually.'},{label:'Repair',detail:'Fix any detected failures.'},{label:'Pull request',detail:'Prepare the code change.'},{label:'Preview deploy',detail:'Create a preview deployment.'},{label:'Verify',detail:'Confirm the result.'}
  ]},
  'Mobile publishing':{kicker:'MOBILE',title:'Prepare an app for iOS and Android release.',description:'Build signed artifacts, run device flows, capture screenshots, validate release requirements and submit through supported tooling after approval.',steps:[
    {label:'Project check',detail:'Validate dependencies and release config.'},{label:'Build',detail:'Create Android and iOS builds.'},{label:'Device',detail:'Launch on emulator or simulator.'},{label:'Maestro',detail:'Run key user flows.'},{label:'Visual QA',detail:'Verify UI states.'},{label:'Screenshots',detail:'Capture store-ready source images.'},{label:'Signing',detail:'Validate release signing.'},{label:'Approval',detail:'Human approval is required before store submission.',approval:true},{label:'Submit',detail:'Upload through supported store tooling.'},{label:'External review',detail:'Apple and Google control store review.'}
  ]},
};

const rotatingPrompts = [problems[1].prompt,problems[4].prompt,problems[9].prompt,problems[0].prompt];

function AppLogo({app}:{app:AppNode}) {
  const [broken,setBroken]=useState(false);
  return <span className="xv-oe-logo" aria-hidden="true">
    {!broken ? <img src={\`https://cdn.simpleicons.org/\${app.slug}/111827\`} alt="" loading="lazy" onError={()=>setBroken(true)} /> :
      <b>{app.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('')}</b>}
  </span>;
}

function positionFor(i:number){
  const ring=i%3;
  const index=Math.floor(i/3);
  const counts=[18,20,15];
  const angle=(index/(counts[ring]||18))*Math.PI*2+ring*.47+i*.035;
  const rx=[30,40,46][ring], ry=[24,37,42][ring];
  return {left:\`\${50+Math.cos(angle)*rx}%\`,top:\`\${49+Math.sin(angle)*ry}%\`,far:ring===2};
}

export function XrogaOutcomeEngine() {
  const [prompt,setPrompt]=useState('');
  const [ghostIndex,setGhostIndex]=useState(0);
  const [category,setCategory]=useState('All');
  const [hovered,setHovered]=useState<AppNode|null>(null);
  const [scenarioName,setScenarioName]=useState('Software');
  const [step,setStep]=useState(-1);
  const [playing,setPlaying]=useState(false);
  const [submitState,setSubmitState]=useState<'idle'|'loading'|'error'|'success'>('idle');
  const stageRef=useRef<HTMLDivElement>(null);
  const scenario=scenarios[scenarioName];

  useEffect(()=>{const id=window.setInterval(()=>setGhostIndex(i=>(i+1)%rotatingPrompts.length),5200);return()=>window.clearInterval(id)},[]);
  useEffect(()=>{setStep(-1);setPlaying(false)},[scenarioName]);
  useEffect(()=>{
    if(!playing) return;
    if(step>=scenario.steps.length){setPlaying(false);return}
    const id=window.setTimeout(()=>setStep(s=>s+1),680);
    return()=>window.clearTimeout(id);
  },[playing,step,scenario.steps.length]);

  const filtered=useMemo(()=>category==='All'?apps:apps.filter(a=>a.category===category),[category]);

  async function startTask(){
    const value=autocorrectText(prompt.trim()); if(!value)return;
    setSubmitState('loading');
    try{
      localStorage.setItem(PENDING_PROMPT_KEY,value);
      const { data }=await createClient().auth.getSession();
      const target=data.session?'/workspace':'/auth/signup';
      const opened=window.open(target,'_blank','noopener,noreferrer');
      if(!opened) throw new Error('workspace popup blocked');
      setSubmitState('success');
    }catch{
      setSubmitState('error');
    }
  }

  function playExample(){setStep(0);setPlaying(true)}
  const iconForStep=(label:string)=>{
    const l=label.toLowerCase();
    if(l.includes('github')||l.includes('pull'))return <GitBranch/>;
    if(l.includes('web')||l.includes('research'))return <Globe2/>;
    if(l.includes('build')||l.includes('implement'))return <Code2/>;
    if(l.includes('data')||l.includes('crm'))return <Database/>;
    if(l.includes('approval'))return <LockKeyhole/>;
    if(l.includes('device')||l.includes('mobile'))return <Smartphone/>;
    return <Check/>;
  };

  return <section className="xv-oe" aria-labelledby="xv-oe-title">
    <div className="xv-oe-orb xv-oe-orb--one" aria-hidden="true"/><div className="xv-oe-orb xv-oe-orb--two" aria-hidden="true"/>
    <div className="xv-oe-shell">
      <div className="xv-oe-module-kicker"><i/> XROGA OUTCOME ENGINE</div>

      <section className="xv-oe-chapter xv-oe-chapter--one">
        <header className="xv-oe-intro">
          <p className="xv-oe-eyebrow"><span>01</span><i/> Start with the outcome</p>
          <h2 id="xv-oe-title">Tell Xroga what needs to happen.</h2>
          <p>One request can become research, software, business actions, verification and shipping — across the tools you already use.</p>
        </header>

        <div className="xv-oe-composer">
          <div className="xv-oe-composer-head"><span><b>X</b><strong>Xroga</strong><em>Outcome request</em></span><small><i/> Execution backend: <strong>live when connected</strong></small></div>
          <div className="xv-oe-textarea-wrap">
            {!prompt && <span className="xv-oe-ghost">{rotatingPrompts[ghostIndex]}</span>}
            <textarea aria-label="Tell Xroga what you want done" value={prompt} onChange={e=>{setPrompt(e.target.value);setSubmitState('idle')}} placeholder="Tell Xroga what you want done…" onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')void startTask()}}/>
          </div>
          <div className="xv-oe-composer-bar">
            <div><button type="button" title="Attachments are enabled by the production task contract"><Paperclip/> <span>Attach</span></button><button type="button" title="Connections are requested only when a task needs them"><PlugZap/> <span>Connect apps</span></button><span className="xv-oe-mode">AUTO ROUTING</span></div>
            <button className="xv-oe-start" type="button" disabled={!prompt.trim()||submitState==='loading'} onClick={()=>void startTask()}>{submitState==='loading'?'Starting…':'Start task'}<ArrowRight/></button>
          </div>
          <div className={\`xv-oe-submit-note is-\${submitState}\`} role="status" aria-live="polite">
            {submitState==='error'&&'The workspace could not be opened. No task was started and no success state was fabricated.'}
            {submitState==='success'&&'Request handed to Xroga’s production workspace flow. The workspace will start it after authentication and runtime checks.'}
          </div>
        </div>

        <div className="xv-oe-problems">
          <div className="xv-oe-problem-head"><span>COMMON OUTCOMES</span><span>Choose one to load an example</span></div>
          <div className="xv-oe-problem-grid">{problems.map(p=><button key={p.name} type="button" onClick={()=>setPrompt(p.prompt)}><span>{p.icon}</span><b>{p.name}</b><small>{p.hint}</small></button>)}</div>
        </div>
        <div className="xv-oe-benefits"><span>Less switching</span><span>Fewer handoffs</span><span>Works across your stack</span><span>Verified before done</span><span>Approval when it matters</span></div>
      </section>

      <div className="xv-oe-bridge" aria-hidden="true"><i/><b/><i/></div>

      <section className="xv-oe-chapter xv-oe-chapter--two">
        <header className="xv-oe-split-head"><div><p className="xv-oe-eyebrow"><span>02</span><i/> Connected work</p><h2>Your tools already know the business. <em>Xroga can work across them.</em></h2></div><p>Apps, APIs, databases and custom MCP servers become one execution surface — without forcing people to learn the plumbing.</p></header>
        <div className="xv-oe-stats"><div><strong>1,558</strong><span>toolkits in the current Composio catalog</span></div><div><strong>Custom</strong><span>MCP + API + internal tools</span></div><div><strong>One</strong><span>request can cross multiple systems</span></div></div>
        <div className="xv-oe-tabs" role="tablist" aria-label="Integration categories">{categories.map(c=><button key={c} role="tab" aria-selected={category===c} className={category===c?'is-active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>

        <div className="xv-oe-universe" ref={stageRef}>
          <svg className="xv-oe-beams" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="oeBeam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--hc-blue)" stopOpacity=".05"/><stop offset=".5" stopColor="var(--hc-blue)" stopOpacity=".55"/><stop offset="1" stopColor="var(--hc-blue)" stopOpacity=".05"/></linearGradient></defs>
            {apps.slice(0,36).map((_,i)=>{const p=positionFor(i);const x=parseFloat(p.left)*12,y=parseFloat(p.top)*7;return <path key={i} d={\`M600 350 Q \${(600+x)/2+(i%2?24:-24)} \${(350+y)/2} \${x} \${y}\`} className={i%5===0?'is-live':''}/>})}
          </svg>
          <div className="xv-oe-core"><i/><i/><i/><div><b>X</b><strong>Xroga</strong><small>routes the work</small></div></div>
          {apps.map((app,i)=>{const p=positionFor(i);const match=category==='All'||app.category===category;return <button key={app.name} type="button" className={\`xv-oe-node \${p.far?'is-far':''} \${match?'':'is-dim'}\`} style={{left:p.left,top:p.top,animationDelay:\`-\${(i%9)*.4}s\`}} onMouseEnter={()=>setHovered(app)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(app)} onBlur={()=>setHovered(null)} aria-label={\`\${app.name}, \${app.category}\`}><AppLogo app={app}/>{app.connected&&<span className="xv-oe-connected"/>}</button>})}
          {hovered&&<div className="xv-oe-tooltip"><strong>{hovered.name}</strong><p>Available through the Xroga integration layer when the required account, permissions and tool are connected.</p><span>{hovered.category} · connect when needed</span></div>}
          <div className="xv-oe-universe-caption">YOUR APPS <i/> YOUR APIs <i/> YOUR MCPS <i/> ONE WORKSPACE</div>
        </div>

        <div className="xv-oe-mobile-apps">{filtered.slice(0,18).map(app=><div key={app.name}><AppLogo app={app}/><span><strong>{app.name}</strong><small>{app.category}</small></span><em>{app.connected?'Connected':'Available'}</em></div>)}</div>
      </section>

      <div className="xv-oe-bridge" aria-hidden="true"><i/><b/><i/></div>

      <section className="xv-oe-chapter xv-oe-chapter--three">
        <header className="xv-oe-split-head"><div><p className="xv-oe-eyebrow"><span>03</span><i/> Verified outcomes</p><h2>Not just an answer. <em>A path to a checked result.</em></h2></div><p>Xroga can expose what is happening, pause for approval when necessary, and only claim success when the underlying systems confirm it.</p></header>
        <div className="xv-oe-execution">
          <div className="xv-oe-scenario-tabs" role="tablist" aria-label="Workflow scenarios">{Object.keys(scenarios).map(name=><button key={name} role="tab" aria-selected={scenarioName===name} className={scenarioName===name?'is-active':''} onClick={()=>setScenarioName(name)}>{name}</button>)}</div>
          <div className="xv-oe-execution-grid">
            <div className="xv-oe-scenario-copy"><span>{scenario.kicker}</span><h3>{scenario.title}</h3><p>{scenario.description}</p><div><button type="button" onClick={playExample}><Play/> {playing?'Restart example':'View example workflow'}</button><small>Example only — no fake execution</small></div><ul><li><ShieldCheck/> Real backend events only</li><li><LockKeyhole/> Approval gates for sensitive actions</li></ul></div>
            <div className="xv-oe-flow">
              <header><span><i className={playing?'is-live':step>=scenario.steps.length?'is-done':''}/><strong>{playing?'Example workflow playing':step>=scenario.steps.length?'Example complete':'Example ready'}</strong></span><small>{playing?'Illustration only':step>=scenario.steps.length?'No real task was executed':'Select “View example workflow”'}</small></header>
              <div className="xv-oe-flow-steps">{scenario.steps.map((s,i)=><div key={s.label} className={\`xv-oe-flow-step \${i===step&&playing?'is-active':''} \${i<step||(!playing&&step>=scenario.steps.length)?'is-done':''} \${s.approval?'is-approval':''}\`}><span>{iconForStep(s.label)}</span><div><strong>{s.label}</strong><small>{s.detail}</small></div><em>{s.approval?'approval':i<step?'example':i===step&&playing?'active':'waiting'}</em></div>)}</div>
              <footer><span>i</span><p><strong>Truthful by default</strong> This canvas is explicitly an explanatory example. A live task should advance only from SSE, WebSocket or polling events emitted by Xroga’s real execution backend.</p></footer>
            </div>
          </div>
        </div>

        <div className="xv-oe-mobile-publish">
          <div><p className="xv-oe-eyebrow"><span>NEW</span><i/> Mobile publishing</p><h3>Build → test → verify → prepare → submit.</h3><p>Xroga can orchestrate builds, device flows, screenshots, signing checks and supported submission tooling. Apple and Google still control store review.</p><div className="xv-oe-tech"><span>Expo EAS</span><span>Maestro</span><span>fastlane</span><span>App Store Connect</span><span>Google Play</span></div></div>
          <div className="xv-oe-device-lab"><div className="xv-oe-phone"><i/><span>iOS build</span><b/><b/><b/></div><div className="xv-oe-phone is-android"><i/><span>Android build</span><b/><b/><b/></div><footer>BUILD <i/> TEST <i/> SCREENSHOTS <i/> APPROVAL <i/> SUBMIT</footer></div>
        </div>
        <div className="xv-oe-closing"><span>One request.</span><span>Many systems.</span><span>Checked before “done.”</span></div>
      </section>
    </div>
  </section>;
}
