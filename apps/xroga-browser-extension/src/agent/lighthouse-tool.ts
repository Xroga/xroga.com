export const LIGHTHOUSE_TOOL = {
  name: 'lighthouse',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    'Run Google Lighthouse on a page address in a separate window: performance, accessibility, best-practices and SEO scores, load metrics, the audits that failed worst with the elements concerned, and the biggest savings. Takes 30 to 90 seconds. device mobile (default) or desktop. Use for "how fast / how good is this site"; audit_page is quicker for on-page SEO text.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      device: { type: 'string', enum: ['mobile', 'desktop'] },
      categories: { type: 'array', maxItems: 4, items: { type: 'string', enum: ['performance', 'accessibility', 'best-practices', 'seo'] } },
    },
    required: ['url'],
    additionalProperties: false,
  },
};
