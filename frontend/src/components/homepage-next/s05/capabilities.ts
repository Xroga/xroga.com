/**
 * S05 · the capability families the earlier sections do not spotlight.
 *
 * Source: the founder's capability map (XROGA_FOUNDER_AZ_30_CAPABILITY_SOURCE, sections cited per tile) checked against
 * docs/product/PUBLIC-CLAIM-VERIFICATION.md. Most of these work through accounts the visitor connects, or are still
 * expanding, so every line says what Xroga helps with, never an outcome: no bookings made, payments taken, approvals
 * won or systems recovered. One section-level note carries that boundary instead of a badge on every tile.
 *
 * Already told earlier on the page, so not tiles here: building websites and apps, browser work, AI Employees, planning
 * and execution, research and files (S00 to S02), growth (S03), store releases (S04). Coding sits here as the
 * engineering capability itself: repositories, debugging and change review, beyond creating a site.
 */

export type CapabilityId =
  | 'travel'
  | 'mail'
  | 'crm'
  | 'payments'
  | 'templates'
  | 'triggers'
  | 'coding'
  | 'apis'
  | 'web3'
  | 'hackathons'
  | 'desktop'
  | 'infra'
  | 'ops';

export interface Capability {
  id: CapabilityId;
  title: string;
  line: string;
  /** founder capability map sections */
  source: string;
}

export const COPY = {
  eyebrow: 'The capability universe',
  titleLead: 'The possibilities',
  titleAccent: 'go further.',
  lede: 'From everyday services to specialized systems, explore what else Xroga can help you accomplish.',
  rows: ['Everyday & business', 'Specialized & technical'] as const,
  note: 'Illustrative examples. Many capabilities work through accounts and services you connect, and availability varies by service.',
};

export const ROWS: Capability[][] = [
  [
    { id: 'travel', title: 'Travel & Bookings', line: 'Flights, hotels, itineraries and reservation planning.', source: '§8' },
    { id: 'mail', title: 'Email & Calendars', line: 'Inbox workflows, meetings, scheduling and messages.', source: '§9' },
    { id: 'crm', title: 'CRM & Support', line: 'Customer records, pipelines, follow-ups and support.', source: '§10' },
    { id: 'payments', title: 'Payments & Accounting', line: 'Invoices, subscriptions, records and commerce tools.', source: '§5, §10' },
    { id: 'templates', title: 'Workflow Templates', line: 'Start from reusable, ready-made workflow structures.', source: '§7, §11' },
    { id: 'triggers', title: 'Workflows & Triggers', line: 'Schedules, webhooks and work that runs on events.', source: '§11' },
  ],
  [
    { id: 'coding', title: 'Coding & Repositories', line: 'Write, debug and improve code across new and existing projects.', source: '§13' },
    { id: 'apis', title: 'Custom APIs & MCPs', line: 'Connect private tools, APIs and MCP servers.', source: '§7' },
    { id: 'web3', title: 'Web3 & Blockchain', line: 'Smart contracts, decentralized apps and on-chain data.', source: '§21' },
    { id: 'hackathons', title: 'Hackathons & Projects', line: 'Research the rules, plan the build, prepare the submission.', source: '§22' },
    { id: 'desktop', title: 'Desktop Applications', line: 'Desktop software, native-style interfaces and releases.', source: '§20' },
    { id: 'infra', title: 'Domains & Infrastructure', line: 'Domains, DNS, HTTPS, databases and sign-in.', source: '§15, §16' },
    { id: 'ops', title: 'Live Operations', line: 'Monitoring, deployments, incidents and system health.', source: '§26' },
  ],
];

export const ALL = ROWS.flat();
