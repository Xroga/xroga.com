import {
  Braces,
  Code2,
  FileText,
  Files,
  Image as ImageIcon,
  LayoutTemplate,
  Network,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { CSSProperties } from 'react';

const capabilities = [
  'Deep Reasoning',
  '1M+ Context',
  'Multimodal',
  'Advanced Coding',
  'Agentic',
  'Structured Output',
  'Long-Horizon',
] as const;

export function XrogaIntelligenceSection() {
  return (
    <section className="xv-intelligence" aria-labelledby="xv-intelligence-title">
      <div className="xv-intelligence__inner">
        <header className="xv-intelligence__intro">
          <p className="xv-intelligence__kicker"><Sparkles aria-hidden="true" /> XROGA INTELLIGENCE</p>
          <h2 id="xv-intelligence-title">Meet <em>Black Hole ∞</em></h2>
          <p>
            One evolving intelligence system built to reason deeply, understand widely, and execute complex work
            across text, code, visuals, and workflows.
          </p>
          <strong>One model. Infinite evolution.</strong>
        </header>

        <div className="xv-intelligence__grid">
          <article className="xv-intelligence-card xv-intelligence-card--large xv-intelligence-card--rays">
            <div className="xv-intelligence-card__copy">
              <span>01 · UNIFIED INTELLIGENCE</span>
              <h3>One Model. <em>Infinite Evolution.</em></h3>
              <p>A single Xroga identity that adapts its depth to the work—without making you choose a vendor or model.</p>
            </div>
            <div className="xv-intelligence-core" aria-label="Understand, reason, and execute as one intelligence loop">
              <i className="xv-intelligence-core__ring" aria-hidden="true" />
              <span className="xv-intelligence-core__node xv-intelligence-core__node--one">Understand</span>
              <span className="xv-intelligence-core__node xv-intelligence-core__node--two">Reason</span>
              <span className="xv-intelligence-core__node xv-intelligence-core__node--three">Execute</span>
              <b aria-hidden="true">∞</b>
            </div>
          </article>

          <article className="xv-intelligence-card xv-intelligence-card--large xv-intelligence-card--glass">
            <div className="xv-intelligence-card__copy">
              <span>02 · ADAPTIVE COMPUTE</span>
              <h3>Adaptive Intelligence <em>Depth.</em></h3>
              <p>Black Hole ∞ applies the right level of reasoning automatically, from a quick answer to a long build.</p>
            </div>
            <div className="xv-depth-rail" aria-label="Conceptual adaptive intelligence depth from fast to deep">
              <div><b>FAST</b><small>Direct tasks</small></div>
              <div className="is-active"><b>BALANCED</b><small>Everyday builds</small></div>
              <div><b>DEEP</b><small>Complex systems</small></div>
              <span aria-hidden="true" />
            </div>
          </article>

          <article className="xv-intelligence-card xv-intelligence-card--cyan">
            <div className="xv-intelligence-card__icon"><Braces aria-hidden="true" /></div>
            <span>03 · LONG CONTEXT</span>
            <h3>1M+ Context Understanding</h3>
            <p>Up to 1M+ context where supported, so large repositories and research can stay connected.</p>
            <div className="xv-context-bars" aria-hidden="true">
              {['DOCS', 'REPOS', 'RESEARCH', 'HISTORY'].map((label, index) => (
                <div key={label}><span>{label}</span><i style={{ '--bar': `${92 - index * 9}%` } as CSSProperties} /></div>
              ))}
            </div>
          </article>

          <article className="xv-intelligence-card xv-intelligence-card--editorial">
            <div className="xv-intelligence-card__icon"><LayoutTemplate aria-hidden="true" /></div>
            <span>04 · NATIVE INPUTS</span>
            <h3>Multimodal &amp; Code Native</h3>
            <p>Understand the brief, inspect the interface, and work directly with the code that powers it.</p>
            <div className="xv-mode-chips" aria-label="Supported input concepts">
              <span><FileText aria-hidden="true" /> TEXT</span>
              <span><ImageIcon aria-hidden="true" /> VISION</span>
              <span><Code2 aria-hidden="true" /> CODE</span>
              <span><LayoutTemplate aria-hidden="true" /> UI</span>
            </div>
          </article>

          <article className="xv-intelligence-card xv-intelligence-card--horizon">
            <div className="xv-intelligence-card__icon"><Network aria-hidden="true" /></div>
            <span>05 · EXECUTION SYSTEM</span>
            <h3>Agentic Execution</h3>
            <p>Reasoning connects to real tools, files, workflows, and outputs—while permission remains visible.</p>
            <div className="xv-agent-map" aria-label="Black Hole Infinity connected to tools, files, workflows and outputs">
              <b>∞</b>
              <span><Wrench aria-hidden="true" />TOOLS</span>
              <span><Files aria-hidden="true" />FILES</span>
              <span><Network aria-hidden="true" />WORKFLOWS</span>
              <span><Sparkles aria-hidden="true" />OUTPUTS</span>
            </div>
          </article>
        </div>

        <ul className="xv-intelligence__capabilities" aria-label="Black Hole Infinity capabilities">
          {capabilities.map((capability) => <li key={capability}>{capability}</li>)}
        </ul>
      </div>
    </section>
  );
}
