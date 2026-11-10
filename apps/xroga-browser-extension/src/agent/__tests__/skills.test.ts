import { describe, expect, it } from 'vitest';
import { skillsFor, skillsSection } from '../skills';

const ids = (request: string) => skillsFor(request).map(skill => skill.id);

describe('skillsFor', () => {
  it('gives a short read-only request no playbook', () => {
    expect(ids('Go to xroga.com and tell me the page heading and the URL. Do not click or type anything.')).toEqual([]);
    expect(skillsSection('Open example.com in a new tab and read the heading')).toBe('');
  });

  it('gives a long or multi-step request the long-task playbook', () => {
    expect(ids('First open the site, then find the pricing page, next copy the plan names and finally list them.')).toContain('long-task');
    expect(ids('x'.repeat(450))).toContain('long-task');
  });

  it('picks research for multi-site work and forms for data entry', () => {
    expect(ids('Compare the pricing of three competitors and give me the top 3')).toContain('research');
    expect(ids('Fill in the contact form on example.com and submit it')).toContain('forms');
  });

  it('keeps advertising work as drafts and routes outside effects through the approval card', () => {
    const section = skillsSection('Analyze my Google Ads account and create a Search campaign with a budget');
    expect(section).toContain('Do not publish');
    expect(ids('Publish the post and send the email')).toContain('consequential');
  });

  it('hands logins to the user', () => {
    expect(skillsSection('Log in to my account and open the dashboard')).toContain('ask_user');
  });

  it('never gives more than four playbooks, and a playbook is short', () => {
    const everything = 'First research and compare competitors, then fill the form, then open the dashboard report, then set the Google Ads budget, then deploy and publish, log in to my account';
    expect(skillsFor(everything).length).toBeLessThanOrEqual(4);
    for (const skill of skillsFor(everything)) expect(skill.body.length).toBeLessThan(900);
  });

  it('is the same text every time for the same request, so it can be cached', () => {
    const request = 'Compare three sites then fill the form';
    expect(skillsSection(request)).toBe(skillsSection(request));
  });
});
