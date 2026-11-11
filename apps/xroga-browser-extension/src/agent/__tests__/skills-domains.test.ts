import { describe, expect, it } from 'vitest';
import { SKILLS, skillsFor, skillsSection } from '../skills';

const ids = (request: string) => skillsFor(request).map(skill => skill.id);

describe('the design, video, records and work-split playbooks', () => {
  it('the design playbook fits kit, logo and mockup requests, and keeps one editor per document', () => {
    const request = 'Create custom football kits: remove the background from my logos, place the sponsor logo on the front and export the mockups.';
    expect(ids(request)).toContain('design-editor');
    const text = skillsSection(request);
    expect(text).toContain('Only one run edits a given document at a time');
    expect(text).toContain('Do not claim a file exists unless');
  });

  it('the video playbook fits editing requests and never claims a render it did not see', () => {
    const request = 'Make a promotional video from these clips: arrange the scenes, add captions and a voiceover, then export the video.';
    expect(ids(request)).toContain('video-editor');
    expect(skillsSection(request)).toContain('Do not claim the video was rendered');
  });

  it('the records playbook fits CRM and store work and says to search first and prove the result', () => {
    const request = 'Add this customer to my CRM and update the product listings in Shopify.';
    expect(ids(request)).toContain('business-records');
    const text = skillsSection(request);
    expect(text).toContain('Search before you create');
    expect(text).toContain('not just the success message');
  });

  it('the work-split playbook fits requests that split, and explains when not to', () => {
    for (const request of [
      'Research three competitors at the same time and compare their prices',
      'Use parallel workers to check each page of the site',
      'Prepare the logo and the colors, then assemble the design',
    ]) {
      expect(ids(request)).toContain('work-split');
    }
    const text = skillsSection('Research three competitors in parallel');
    expect(text).toContain('delegate');
    expect(text).toContain('batch');
    expect(text).toContain('start_parallel_tasks');
    expect(text).toContain('Do not split what depends on the screen');
    expect(text).toContain('observations, not facts you have checked');
  });

  it('adds none of them to a plain request', () => {
    for (const request of [
      'Open example.com and tell me the heading',
      'Click the Add to cart button and tell me the total',
      'What is the title of this page?',
    ]) {
      const picked = ids(request);
      for (const id of ['design-editor', 'video-editor', 'business-records', 'work-split']) expect(picked).not.toContain(id);
    }
  });

  it('keeps at most four playbooks, and each stays small enough to carry in every turn', () => {
    const crowded = 'Research three competitors in parallel, design a logo, edit a video, update the CRM, run an SEO audit and launch Google Ads and Meta Ads.';
    expect(skillsFor(crowded).length).toBeLessThanOrEqual(4);
    for (const skill of SKILLS) expect(skill.body.length).toBeLessThan(2_600);
  });
});
