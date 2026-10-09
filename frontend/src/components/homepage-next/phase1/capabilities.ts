/**
 * Xroga's full capability map (founder A–Z, 30 areas) arranged as the seven S01 Capability
 * Worlds (TRUE_BREADTH §13–15). Storytelling groups, not a product limit: every one of the 30
 * areas appears exactly once (enforced by tokens.test.ts).
 *
 * Presentation states (TRUE_BREADTH §22): `available` = present in the product today;
 * `expanding` = broader platform direction still being built (repo marks it PLANNED/UNKNOWN).
 * Connecting/authorising is shown as a state in the scenes, not as a label on every item.
 * Repo evidence: docs/xroga-homepage-research-intake/AZ_30_PRODUCT_TRUTH_AND_HOMEPAGE_COVERAGE.csv
 */
import type { ProviderId } from './providerMarks';

export type Presence = 'available' | 'expanding';

export type WorldId = 'research' | 'files' | 'business' | 'build' | 'browser' | 'publish' | 'operate';

export interface CapabilityArea {
  id: number; // founder A–Z number
  presence: Presence;
}

export interface CapabilityWorld {
  id: WorldId;
  index: string;
  title: string;
  /** Real sub-capability terms shown inside the slab (12–14px). */
  labels: readonly string[];
  /** Which founder areas this world carries. */
  areas: readonly CapabilityArea[];
  /** Real providers from Xroga's catalog that appear in this world's scene. */
  providers: readonly ProviderId[];
  /** One sentence: what the living scene shows. */
  scene: string;
}

const a = (id: number, presence: Presence = 'available'): CapabilityArea => ({ id, presence });

export const WORLDS: readonly CapabilityWorld[] = [
  {
    id: 'research',
    index: '01',
    title: 'Research & intelligence',
    labels: ['Black Hole V∞', 'Model routing', 'Web research', 'X intelligence', 'Source comparison', 'Reasoning'],
    areas: [a(2), a(3)],
    providers: ['anthropic', 'gemini', 'perplexity', 'huggingface', 'x'],
    scene: 'Sources converge, models are routed, evidence resolves; one source stays in conflict.',
  },
  {
    id: 'files',
    index: '02',
    title: 'Files, data & knowledge',
    labels: ['PDFs & docs', 'Images', 'CSV & sheets', 'Knowledge', 'Workspace context'],
    areas: [a(1), a(4)],
    providers: ['googledrive', 'dropbox', 'notion', 'airtable'],
    scene: 'Loose files fall into place and become structured, searchable context.',
  },
  {
    id: 'business',
    index: '03',
    title: 'Apps, business & automation',
    labels: ['Email', 'Calendar', 'CRM', 'Support', 'Accounting', 'MCP & APIs', 'Recurring work', 'Travel'],
    areas: [a(5), a(6), a(7), a(8, 'expanding'), a(9), a(10), a(11, 'expanding')],
    providers: ['gmail', 'googlecalendar', 'hubspot', 'quickbooks', 'intercom', 'calendly'],
    scene: 'Apps dock to one workflow; a sensitive step waits for approval, then completes.',
  },
  {
    id: 'build',
    index: '04',
    title: 'Build, infrastructure & Web3',
    labels: ['New products', 'Existing repos', 'UI & design', 'Database & auth', 'Payments', 'Domains & DNS', 'Web3'],
    areas: [a(12), a(13), a(14), a(15), a(16), a(21)],
    providers: ['github', 'figma', 'supabase', 'neon', 'stripe', 'cloudflare'],
    scene: 'Architecture planes assemble; data, auth and payments connect; a product surface forms.',
  },
  {
    id: 'browser',
    index: '05',
    title: 'Browser, test & repair',
    labels: ['Browser QA', 'Diagnose', 'Repair', 'Retest', 'Evidence', 'Computer use'],
    areas: [a(17, 'expanding'), a(18)],
    providers: ['sentry', 'linear', 'posthog'],
    scene: 'A pointer acts, a fault is isolated with evidence, repaired and verified.',
  },
  {
    id: 'publish',
    index: '06',
    title: 'Publish, launch & growth',
    labels: ['Deploy', 'Android · iOS', 'Chrome · desktop', 'Launch', 'SEO & AI search', 'Acquisition', 'Analytics'],
    areas: [a(19), a(20), a(23), a(24), a(25)],
    providers: ['vercel', 'railway', 'googleads', 'mailchimp', 'youtube', 'reddit', 'mixpanel'],
    scene: 'One product branches to its destinations; growth signals orbit it and one opportunity fires.',
  },
  {
    id: 'operate',
    index: '07',
    title: 'Operations, continuity & control',
    labels: ['Operations Centre', 'Persistent context', 'Schedules', 'Approvals', 'Audit trail', 'Ownership', 'Hackathons'],
    areas: [a(26), a(27), a(29), a(28), a(22), a(30, 'expanding')],
    providers: [],
    scene: 'A time spine: scheduled work wakes, asks for approval, logs evidence and keeps state.',
  },
];

/** Integration count used in copy. Source and binding rules: docs/homepage-implementation/PHASE1_TRUTH_NOTES.md */
export const INTEGRATION_COUNT = 1603;
export const INTEGRATION_COUNT_LABEL = '1,603';
