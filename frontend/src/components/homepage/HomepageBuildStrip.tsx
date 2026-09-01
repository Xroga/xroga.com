import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { CODING_LANGUAGES } from '@/lib/codingLanguages';

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub' },
  { id: 'gitlab', name: 'GitLab' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'supabase', name: 'Supabase' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'replit', name: 'Replit' },
] as const;

function IntegrationLane({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="xv-stack-strip__items" aria-hidden={hidden || undefined}>
      {INTEGRATIONS.map((integration) => (
        <li key={integration.id} className="xv-stack-strip__chip">
          <IntegrationLogo id={integration.id} name={integration.name} size={18} />
          <span>{integration.name}</span>
        </li>
      ))}
    </ul>
  );
}

function LanguageLane({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="xv-stack-strip__items" aria-hidden={hidden || undefined}>
      {CODING_LANGUAGES.map((language) => (
        <li key={language.title} className="xv-stack-strip__chip xv-stack-strip__chip--language">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ fill: language.color }}>
            <path d={language.path} />
          </svg>
          <span>{language.title}</span>
        </li>
      ))}
    </ul>
  );
}

export function HomepageBuildStrip() {
  return (
    <div className="xv-stack-strip" aria-labelledby="xv-stack-strip-title">
      <div className="xv-stack-strip__heading">
        <p>THE STACK ALREADY AROUND YOU</p>
        <h2 id="xv-stack-strip-title">
          The tools and languages <span>you already know.</span>
        </h2>
        <small>
          Bring the product you have or start something new. Xroga works across the repository,
          services, and languages your build actually needs.
        </small>
      </div>

      <div className="xv-stack-strip__lanes">
        <div className="xv-stack-strip__lane">
          <strong>CONNECTS WITH</strong>
          <div className="xv-stack-strip__viewport" aria-label="Services Xroga can connect with">
            <div className="xv-stack-strip__track">
              <IntegrationLane />
              <IntegrationLane hidden />
            </div>
          </div>
        </div>

        <div className="xv-stack-strip__lane">
          <strong>WRITES AND WORKS IN</strong>
          <div className="xv-stack-strip__viewport" aria-label="Languages Xroga writes and works in">
            <div className="xv-stack-strip__track xv-stack-strip__track--reverse">
              <LanguageLane />
              <LanguageLane hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
