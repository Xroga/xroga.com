import type { PreviewFeatureAvailability } from './osPreview';

export interface PreviewDestination {
  slug: string;
  label: string;
  group: 'Work' | 'Create' | 'Automate' | 'Explore' | 'Insights' | 'Account';
  availability: PreviewFeatureAvailability;
  benefit: string;
  detail: string;
  liveHref?: string;
}

export const PREVIEW_DESTINATIONS: PreviewDestination[] = [
  { slug:'overview', label:'Overview', group:'Work', availability:'interactive-preview', benefit:'Understand the whole outcome.', detail:'A shared example of request, plan, review and result.' },
  { slug:'workspace', label:'Workspace', group:'Work', availability:'interactive-preview', benefit:'Shape a clear outcome.', detail:'Choose a sample project and inspect its simulated plan.', liveHref:'/workspace' },
  { slug:'projects', label:'Projects', group:'Work', availability:'interactive-preview', benefit:'Move between sample projects.', detail:'These example projects are separate from your real account projects.', liveHref:'/dashboard/projects' },
  { slug:'activity', label:'Activity', group:'Work', availability:'interactive-preview', benefit:'Follow the example timeline.', detail:'Local demo milestones only; no production activity feed.' },
  { slug:'coding', label:'Software Builder', group:'Create', availability:'interactive-preview', benefit:'Inspect a sample build or repair.', detail:'Review example files, a proposed diff and deterministic test results.' },
  { slug:'browser', label:'Browser Operator', group:'Create', availability:'interactive-preview', benefit:'See bounded browser steps.', detail:'Try a deterministic CRM browser example with approval and retry.' },
  { slug:'research', label:'Research', group:'Create', availability:'interactive-preview', benefit:'Inspect claims and uncertainty.', detail:'Fictional example evidence; not live web research.' },
  { slug:'artifacts', label:'Artifacts', group:'Create', availability:'interactive-preview', benefit:'Inspect example deliverables.', detail:'Local previews only; no durable upload or external share.' },
  { slug:'drive', label:'Drive', group:'Create', availability:'coming-soon', benefit:'Organize durable project files.', detail:'R2 uploads, backups and signed sharing are not connected.' },
  { slug:'automations', label:'Workflows', group:'Automate', availability:'interactive-preview', benefit:'Design an approval-first workflow.', detail:'Edit and validate a local graph; no schedule or webhook is created.' },
  { slug:'employees', label:'AI Employees', group:'Automate', availability:'interactive-preview', benefit:'Review the right specialist.', detail:'Browse example roles and permissions; no worker is assigned.' },
  { slug:'work-packs', label:'Work Packs', group:'Automate', availability:'interactive-preview', benefit:'Bundle a repeatable example.', detail:'Choose a local pack; no real team or job is created.' },
  { slug:'genome', label:'Xroga Genome', group:'Explore', availability:'interactive-preview', benefit:'Reuse a trusted foundation.', detail:'Inspect demo assets, compatibility and license rejection.' },
  { slug:'experience', label:'Experience Engine', group:'Explore', availability:'interactive-preview', benefit:'Turn a verified pattern into a candidate.', detail:'Review privacy and trust on fictional examples; no procedure is certified.' },
  { slug:'skills', label:'Skills & Integrations', group:'Explore', availability:'interactive-preview', benefit:'Explore capabilities and permissions.', detail:'A preview catalog; no MCP server is installed or connected.' },
  { slug:'rich-results', label:'Rich answers', group:'Explore', availability:'interactive-preview', benefit:'Explore structured answer cards.', detail:'The gallery uses sample fixtures; real chat uses its existing renderer.' },
  { slug:'bench', label:'XrogaBench', group:'Insights', availability:'interactive-preview', benefit:'Compare example strategies.', detail:'Illustrative measurements only, never production benchmarks.' },
  { slug:'models', label:'Model Strategy', group:'Insights', availability:'interactive-preview', benefit:'Review a proposed model mix.', detail:'Sample routing tradeoffs without real provider calls.' },
  { slug:'insights', label:'Usage & Budgets', group:'Insights', availability:'interactive-preview', benefit:'Understand a sample budget.', detail:'Demo numbers are not billing or production usage.' },
  { slug:'settings', label:'Settings', group:'Account', availability:'interactive-preview', benefit:'Control the preview.', detail:'Reset demo data and review availability; real account settings remain separate.', liveHref:'/settings' },
  { slug:'help', label:'Help', group:'Account', availability:'interactive-preview', benefit:'Understand what is real.', detail:'A guide to the live workspace versus this preview.' },
];

export const PREVIEW_GROUPS = ['Work','Create','Automate','Explore','Insights','Account'] as const;
export function previewDestination(slug: string) { return PREVIEW_DESTINATIONS.find((item) => item.slug === slug); }
