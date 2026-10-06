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
  | { name: string; mark: Mark; src?: never }
  | { name: string; src: string; mark?: never };

const LEGACY_ICON = (slug: string) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/${slug}.svg`;

const PRIMARY_PLUGINS: readonly PluginGraphic[] = [
  { name: 'Google Drive', mark: siGoogledrive },
  { name: 'Gmail', mark: siGmail },
  { name: 'Google Calendar', mark: siGooglecalendar },
  { name: 'Slack', src: LEGACY_ICON('slack') },
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
  { name: 'Canva', src: LEGACY_ICON('canva') },
];

const LOOP_PLUGINS: readonly PluginGraphic[] = [
  { name: 'Cloudflare', mark: siCloudflare },
  { name: 'Netlify', mark: siNetlify },
  { name: 'OpenAI', src: LEGACY_ICON('openai') },
  { name: 'Anthropic', mark: siAnthropic },
  { name: 'PayPal', mark: siPaypal },
  { name: 'QuickBooks', mark: siQuickbooks },
  { name: 'Linear', mark: siLinear },
  { name: 'Sentry', mark: siSentry },
  { name: 'Brevo', mark: siBrevo },
  { name: 'Railway', mark: siRailway },
  { name: 'DigitalOcean', mark: siDigitalocean },
  { name: 'Heroku', src: LEGACY_ICON('heroku') },
  { name: 'Render', mark: siRender },
  { name: 'Lemon Squeezy', mark: siLemonsqueezy },
  { name: 'Fly.io', mark: siFlydotio },
  { name: 'Gemini', mark: siGooglegemini },
  { name: 'Microsoft Outlook', src: LEGACY_ICON('microsoftoutlook') },
  { name: 'Microsoft Teams', src: LEGACY_ICON('microsoftteams') },
  { name: 'monday.com', src: LEGACY_ICON('mondaydotcom') },
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
  return <img src={plugin.src} alt="" loading="eager" decoding="async" draggable={false} />;
}

const loopItems = LOOP_PLUGINS.map((plugin) =>
  plugin.mark
    ? {
        node: (
          <span className="xcap-loop-logo-shell" title={plugin.name}>
            <BrandGraphic plugin={plugin} />
          </span>
        ),
        title: plugin.name,
        ariaLabel: plugin.name,
      }
    : {
        src: plugin.src,
        alt: plugin.name,
        title: plugin.name,
      }
);

export function HomepageIntegrationConstellation() {
  return (
    <div className="xcap-integration-modern" aria-label="40 popular business and developer integrations connected through Xroga">
      <div className="xcap-constellation" aria-label="20 connected integrations around Xroga">
        <div className="xcap-connection-field" aria-hidden="true">
          {PRIMARY_PLUGINS.map((plugin, index) => {
            const outer = index < 10;
            const ringIndex = index % 10;
            const angle = ringIndex * 36 - 90 + (outer ? 0 : 18);
            return (
              <span
                key={`beam-${plugin.name}`}
                className={`xcap-connection-beam ${outer ? 'is-outer' : 'is-inner'}`}
                style={{ '--beam-angle': `${angle}deg`, '--beam-delay': `${index * -120}ms` } as CSSProperties}
              />
            );
          })}
        </div>

        {PRIMARY_PLUGINS.map((plugin, index) => {
          const outer = index < 10;
          const ringIndex = index % 10;
          const angle = ringIndex * 36 - 90 + (outer ? 0 : 18);
          return (
            <span
              className={`xcap-constellation-item ${outer ? 'is-outer' : 'is-inner'}`}
              key={plugin.name}
              style={{ '--orbit-angle': `${angle}deg`, '--float-delay': `${index * -130}ms` } as CSSProperties}
              title={plugin.name}
              aria-label={plugin.name}
            >
              <span className="xcap-constellation-counter" style={{ transform: `rotate(${-angle}deg)` }}>
                <BrandGraphic plugin={plugin} />
              </span>
            </span>
          );
        })}

        <div className="xcap-xroga-controller" aria-label="Xroga controls the connected integrations">
          <div className="xcap-electric-layer" aria-hidden="true">
            <ElectricLogo
              src={SIDEBAR_LOGO_URL}
              color="#dff4ff"
              glowColor="#4c8dff"
              scale={0.68}
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
            <Image src={SIDEBAR_LOGO_URL} alt="Xroga" width={78} height={78} priority={false} />
          </span>
          <span className="xcap-controller-label">XROGA</span>
        </div>
      </div>

      <div className="xcap-more-plugins">
        <span className="xcap-more-plugins-label">20 more connected apps</span>
        <LogoLoop
          logos={loopItems}
          speed={54}
          direction="left"
          logoHeight={32}
          gap={26}
          hoverSpeed={12}
          scaleOnHover
          fadeOut
          ariaLabel="20 more Xroga integrations"
          className="xcap-extra-logo-loop"
        />
      </div>
    </div>
  );
}
