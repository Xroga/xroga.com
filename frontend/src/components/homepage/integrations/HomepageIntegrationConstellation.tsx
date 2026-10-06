'use client';

import Image from 'next/image';
import {
  siGoogledrive,
  siGmail,
  siGooglecalendar,  siGithub,
  siGitlab,
  siNotion,
  siHubspot,
  siStripe,
  siShopify,
  siVercel,
  siSupabase,
  siAirtable,
  siDropbox,
  siDiscord,
  siJira,
  siAsana,
  siTrello,
  siFigma,  siCloudflare,
  siNetlify,  siAnthropic,
  siPaypal,
  siQuickbooks,
  siLinear,
  siSentry,
  siBrevo,
  siRailway,
  siDigitalocean,  siRender,
  siLemonsqueezy,
  siFlydotio,
  siGooglegemini,  siPosthog,
} from 'simple-icons';
import type { CSSProperties } from 'react';

import { SIDEBAR_LOGO_URL } from '@/lib/theme';
import ElectricLogo from './ElectricLogo';
import LogoLoop from './LogoLoop';

type Mark = { path: string; hex: string; title: string; slug: string };
type PluginGraphic =
  | { name: string; mark: Mark; src?: never; hex?: never }
  | { name: string; src: string; hex: string; mark?: never };

const LEGACY_ICON = (slug: string) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/${slug}.svg`;

const PRIMARY_PLUGINS: readonly PluginGraphic[] = [
  { name: 'Google Drive', mark: siGoogledrive },
  { name: 'Gmail', mark: siGmail },
  { name: 'Google Calendar', mark: siGooglecalendar },
  { name: 'Slack', src: LEGACY_ICON('slack'), hex: '#4A154B' },
  { name: 'GitHub', mark: siGithub },
  { name: 'GitLab', mark: siGitlab },
  { name: 'Notion', mark: siNotion },
  { name: 'HubSpot', mark: siHubspot },
  { name: 'Stripe', mark: siStripe },
  { name: 'Shopify', mark: siShopify },
  { name: 'Vercel', mark: siVercel },
  { name: 'Supabase', mark: siSupabase },
  { name: 'Airtable', mark: siAirtable },
  { name: 'Dropbox', mark: siDropbox },
  { name: 'Discord', mark: siDiscord },
  { name: 'Jira', mark: siJira },
  { name: 'Asana', mark: siAsana },
  { name: 'Trello', mark: siTrello },
  { name: 'Figma', mark: siFigma },
  { name: 'Canva', src: LEGACY_ICON('canva'), hex: '#00C4CC' },
];

const LOOP_PLUGINS: readonly PluginGraphic[] = [
  { name: 'Cloudflare', mark: siCloudflare },
  { name: 'Netlify', mark: siNetlify },
  { name: 'OpenAI', src: LEGACY_ICON('openai'), hex: '#10A37F' },
  { name: 'Anthropic', mark: siAnthropic },
  { name: 'PayPal', mark: siPaypal },
  { name: 'QuickBooks', mark: siQuickbooks },
  { name: 'Linear', mark: siLinear },
  { name: 'Sentry', mark: siSentry },
  { name: 'Brevo', mark: siBrevo },
  { name: 'Railway', mark: siRailway },
  { name: 'DigitalOcean', mark: siDigitalocean },
  { name: 'Heroku', src: LEGACY_ICON('heroku'), hex: '#430098' },
  { name: 'Render', mark: siRender },
  { name: 'Lemon Squeezy', mark: siLemonsqueezy },
  { name: 'Fly.io', mark: siFlydotio },
  { name: 'Gemini', mark: siGooglegemini },
  { name: 'Microsoft Outlook', src: LEGACY_ICON('microsoftoutlook'), hex: '#0078D4' },
  { name: 'Microsoft Teams', src: LEGACY_ICON('microsoftteams'), hex: '#6264A7' },
  { name: 'monday.com', src: LEGACY_ICON('mondaydotcom'), hex: '#FF3D57' },
  { name: 'PostHog', mark: siPosthog },
];

function BrandGraphic({ plugin }: { plugin: PluginGraphic }) {
  if (plugin.mark) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ color: `#${plugin.mark.hex}` }}>
        <path fill="currentColor" d={plugin.mark.path} />
      </svg>
    );
  }
  return (
    <span
      className="xcap-remote-brand-mark"
      aria-hidden="true"
      style={{
        '--brand-src': `url("${plugin.src}")`,
        '--brand-color': plugin.hex,
      } as CSSProperties}
    />
  );
}

const loopItems = LOOP_PLUGINS.map((plugin) => ({
  node: (
    <span className="xcap-loop-logo-shell" title={plugin.name}>
      <BrandGraphic plugin={plugin} />
    </span>
  ),
  title: plugin.name,
  ariaLabel: plugin.name,
}));

export function HomepageIntegrationConstellation() {
  const outerPlugins = PRIMARY_PLUGINS.slice(0, 10);
  const innerPlugins = PRIMARY_PLUGINS.slice(10, 20);

  const renderRing = (plugins: readonly PluginGraphic[], ring: 'outer' | 'inner') => (
    <div className={`xcap-orbit-ring is-${ring}`} aria-hidden="false">
      {plugins.map((plugin, index) => {
        const angle = index * 36 - 90 + (ring === 'inner' ? 18 : 0);
        return (
          <span
            className={`xcap-connection-beam is-${ring}`}
            key={`beam-${ring}-${plugin.name}`}
            style={{ '--beam-angle': `${angle}deg`, '--beam-delay': `${index * -130}ms` } as CSSProperties}
            aria-hidden="true"
          />
        );
      })}

      {plugins.map((plugin, index) => {
        const angle = index * 36 - 90 + (ring === 'inner' ? 18 : 0);
        return (
          <span
            className={`xcap-constellation-item is-${ring}`}
            key={plugin.name}
            style={{ '--orbit-angle': `${angle}deg`, '--counter-angle': `${-angle}deg` } as CSSProperties}
            title={plugin.name}
            aria-label={plugin.name}
          >
            <span className="xcap-constellation-counter">
              <BrandGraphic plugin={plugin} />
            </span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="xcap-integration-modern" aria-label="40 popular business and developer integrations connected through Xroga">
      <div className="xcap-constellation" aria-label="20 connected integrations moving around Xroga">
        {renderRing(outerPlugins, 'outer')}
        {renderRing(innerPlugins, 'inner')}

        <div className="xcap-xroga-controller" aria-label="Xroga controls the connected integrations">
          <div className="xcap-electric-layer" aria-hidden="true">
            <ElectricLogo
              src={SIDEBAR_LOGO_URL}
              color="#dff4ff"
              glowColor="#4c8dff"
              scale={0.74}
              strands={4}
              bend={0.6}
              crackle={1.5}
              arcs={1}
              speed={2.5}
              interactive
              intensity={1.15}
              glow={1.2}
              thickness={1.6}
              flicker={0.65}
              fill={0}
              cursorIntensity={0.75}
              cursorRadius={100}
            />
          </div>
          <span className="xcap-xroga-controller-plate">
            <Image src={SIDEBAR_LOGO_URL} alt="Xroga" width={84} height={84} priority={false} />
          </span>
          <span className="xcap-controller-label">XROGA</span>
        </div>
      </div>

      <div className="xcap-more-plugins" aria-label="20 additional connected integrations">
        <LogoLoop
          logos={loopItems}
          speed={46}
          direction="left"
          logoHeight={34}
          gap={22}
          hoverSpeed={18}
          scaleOnHover
          fadeOut
          ariaLabel="20 additional Xroga integrations"
          className="xcap-extra-logo-loop"
        />
      </div>
    </div>
  );
}
