import { describe, expect, it } from 'vitest';
import { routeFor } from '../router';

// A table of plain-language requests and the route each should take. It is a regression set for the rules, not a measurement of the model:
// a "single" request that is routed "multi" wastes worker tools on every turn, and the other way round hides a useful tool.
const TABLE: Array<[string, 'direct' | 'readers' | 'single' | 'multi']> = [
  // direct: one site, one read
  ['Open github.com and read the first heading', 'direct'],
  ['Go to bbc.com and tell me the title', 'direct'],
  ['Visit https://news.ycombinator.com and get the main heading', 'direct'],
  // single: ordinary adaptive work
  ['Log in to my dashboard with the saved password and export the report', 'single'],
  ['Fill the contact form on this page with my name and email, then submit it', 'single'],
  ['Find the cheapest flight from Lahore to Dubai on this page', 'single'],
  ['Change my profile photo to the file I attached', 'single'],
  ['Turn on two-factor authentication in settings', 'single'],
  ['Add this product to the cart and open the checkout page', 'single'],
  ['Rename the document to Q4 plan and share it with the team', 'single'],
  ['Scroll to the pricing table and tell me the price of the Pro plan', 'single'],
  ['Open example.com, then click About, then read the first paragraph', 'single'],
  ['Mark all notifications as read', 'single'],
  ['Download the latest invoice as a PDF', 'single'],
  // readers: a question for the web
  ['What are the best SEO practices this year', 'readers'],
  ['Who won the most recent Formula 1 race and what was the margin', 'readers'],
  ['Find recent reviews of the Sony WH-1000XM5 headphones', 'readers'],
  // multi: genuinely independent or staged
  ['Compare pricing on stripe.com, paddle.com and lemonsqueezy.com and summarise the differences', 'multi'],
  ['Research these three competitors in parallel and give me one table', 'multi'],
  ['Please do these tasks:\n1. Read the pricing page of acme.com\n2. Read the docs home of acme.com\n3. Read the changelog of acme.com', 'multi'],
  ['Use several agents to check the home pages of a.com, b.com and c.com for broken links', 'multi'],
  ['Research how top SaaS sites structure onboarding, then write a summary, then draft our own flow, then prepare a review checklist for the design team. Keep each part separate and make sure the checklist matches the draft flow closely. Work in parallel where you can.', 'multi'],
];

describe('routeFor on a table of real requests', () => {
  for (const [text, expected] of TABLE) {
    it(`${expected}: ${text.replace(/\n/g, ' / ').slice(0, 70)}`, () => {
      expect(routeFor(text).route).toBe(expected);
    });
  }
});
