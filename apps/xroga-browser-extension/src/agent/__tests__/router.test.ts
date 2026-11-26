import { describe, expect, it } from 'vitest';
import { routeFor } from '../router';

const route = (text: string, hasWorkers = false) => routeFor(text, { hasWorkers });

describe('routeFor', () => {
  it('sends an explicit single read to the direct path', () => {
    expect(route('Open chatgpt.com and read the first visible heading').route).toBe('direct');
    expect(route('Open chatgpt.com and read the first visible heading').offerWorkers).toBe(false);
  });

  it('keeps ordinary browser work with one agent and does not offer workers', () => {
    for (const text of [
      'Open example.com and click the first link, then tell me what it says',
      'Fill in the contact form on this page with my details',
      'Find the cheapest laptop on this page and add it to the cart',
      'Change the notification setting in my dashboard to weekly',
    ]) {
      const d = route(text);
      expect(d.route, text).toBe('single');
      expect(d.offerWorkers, text).toBe(false);
    }
  });

  it('a short request that merely says then stays with one agent', () => {
    expect(route('Open the settings page, then turn on dark mode').route).toBe('single');
  });

  it('offers workers for clearly independent or parallel work', () => {
    expect(route('Check pricing on stripe.com, paddle.com and lemonsqueezy.com and compare them').route).toBe('multi');
    expect(route('Research these two competitors in parallel and report back').route).toBe('multi');
    expect(route('Do these:\n1. Read the pricing page\n2. Read the docs home\n3. Read the changelog').route).toBe('multi');
    expect(route('Run this task with several agents working at the same time').offerWorkers).toBe(true);
  });

  it('offers workers for a long staged request, and for research followed by implementation', () => {
    const long = 'Research how competitors structure their onboarding flows, then write a summary of the best ideas, then create a draft of our own flow, and finally prepare a short checklist for the design team so they can review the result quickly. ' + 'Keep each part separate. '.repeat(4);
    expect(route(long).route).toBe('multi');
  });

  it('a web question uses parallel readers, not workers', () => {
    const d = route('What are the best practices for SEO this year');
    expect(['readers', 'single']).toContain(d.route);
    expect(d.offerWorkers).toBe(false);
  });

  it('keeps worker status available in a conversation that already started workers', () => {
    const d = route('How is it going?', true);
    expect(d.route).toBe('multi');
    expect(d.offerWorkers).toBe(true);
  });

  it('never throws on odd input and explains itself', () => {
    expect(route('').route).toBe('single');
    expect(route('   ').reasons.length).toBeGreaterThan(0);
    expect(route('a'.repeat(5000)).reasons.length).toBeGreaterThan(0);
  });
});
