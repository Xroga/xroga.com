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

  it('picks the advertising playbooks by platform and keeps them as drafts', () => {
    expect(ids('Analyze my Google Ads account and create a Search campaign')).toContain('google-ads');
    const google = skillsSection('Create a Google Ads Search campaign for my car recovery business');
    expect(google).toContain('Pick the campaign type from the business model');
    expect(google).toContain('15 headlines');
    expect(google).toContain('paused');
    expect(ids('Build a Meta Ads campaign for my store in Ads Manager')).toContain('meta-ads');
    const meta = skillsSection('Build a Meta Ads campaign');
    expect(meta).toContain('Events Manager');
    expect(meta).toContain('draft or paused');
  });

  it('picks cloud, database, shell, code and debugging playbooks', () => {
    expect(skillsSection('Open Cloud Shell and run the gcloud describe command')).toContain('one command');
    expect(ids('Open Google Cloud and check the Cloud Run revision logs')).toContain('cloud');
    expect(skillsSection('Look at the Supabase table list')).toContain('read-only select that has a limit');
    expect(ids('Fix the bug in the checkout code on GitHub')).toEqual(expect.arrayContaining(['code', 'debugging']));
    expect(skillsSection('Debug why the contact form is not working')).toContain('Reproduce the problem first');
  });

  it('picks research for multi-site work and forms for data entry', () => {
    expect(ids('Compare the pricing of three competitors and give me the top 3')).toContain('research');
    expect(ids('Fill in the contact form on example.com and submit it')).toContain('forms');
  });

  it('routes outside effects through the approval card and logins to the user', () => {
    expect(ids('Publish the post and send the email')).toContain('consequential');
    expect(skillsSection('Log in to my account and open the dashboard')).toContain('ask_user');
  });

  it('never gives more than four playbooks and always keeps long-task when it fits', () => {
    const everything =
      'First research and compare competitors, then fill the form, then open the Google Ads dashboard report, then fix the code bug on GitHub, then check the Supabase database, then deploy and publish, log in to my account';
    const picked = ids(everything);
    expect(picked.length).toBeLessThanOrEqual(4);
    expect(picked).toContain('long-task');
    for (const skill of skillsFor(everything)) expect(skill.body.length).toBeLessThan(3_200);
  });

  it('is the same text every time for the same request, so it can be cached', () => {
    const request = 'Compare three sites then fill the form';
    expect(skillsSection(request)).toBe(skillsSection(request));
  });
});

describe('connected apps and SEO', () => {
  it('points the agent at plugin_search when the task names an app or a tool category', () => {
    expect(ids('Pull my keyword rankings from Ahrefs and update the Notion page')).toContain('connected-apps');
    expect(skillsSection('Use my connected apps to find the lead list')).toContain('plugin_search');
    expect(skillsSection('Use my connected apps to find the lead list')).toContain('not available in this run');
  });

  it('gives SEO work an audit-first playbook that keeps publishing behind approval', () => {
    const seo = skillsSection('Run an SEO audit of my site and plan AEO content');
    expect(seo).toContain('Audit before you advise');
    expect(seo).toContain('approval');
    expect(ids('Do a site audit')).toContain('seo');
  });

  it('does not add either to a simple read task', () => {
    expect(ids('Go to example.com and tell me the heading')).toEqual([]);
  });
});
