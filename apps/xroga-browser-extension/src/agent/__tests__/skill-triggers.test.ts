import { describe, expect, it } from 'vitest';
import { SKILL_CATALOG, searchSkills } from '../skill-catalog';

// A trigger eval for the bundled skills, as the agentskills guide describes: realistic requests (formal, casual, with typos, with the domain unnamed) that should bring a skill
// to the top, and near-misses that share words with a skill but need something else. It runs on the ranker alone, no model, so a change to a skill's words that breaks how it is
// found fails here.
const SHOULD: Array<[string, string]> = [
  ['set up a google ads search campaign with keywords and negative keywords for my plumbing business', 'google-ads-search-campaigns'],
  ['why is my cpa so high on google ads, check the bidding and conversion tracking', 'google-ads-search-campaigns'],
  ['create a facebook and instagram ad with an audience and a daily budget', 'meta-ads-campaigns'],
  ['add 20 products with variants and sku to my shopify store and set discounts', 'shopify-store-admin'],
  ['update the deal stage for acme in hubspot and add the contact', 'crm-records'],
  ['put these figures in the sheet and add a formula in column D', 'spreadsheets-and-documents'],
  ['open a pull request on github with my branch changes', 'web-coding-workflow'],
  ['audit the seo of this page: title, meta description and headings', 'seo-onpage-audit'],
  ['export the rows of this dashboard table to csv across all pages', 'dashboard-data-extraction'],
  ['draw shapes in this vector design editor using its script console', 'painted-editor-scripting'],
  ['trim and split the clips on the video timeline and add captions', 'video-timeline-editor'],
  ['fill the registration form and submit it', 'forms-and-business-apps'],
  ['fix my google business profile listing so it ranks in the map pack', 'google-business-profile'],
  ['make a facebook page and an instagram profile for the business', 'business-presence-setup'],
  ['research this question from several sources and give citations', 'research-with-sources'],
  ['upload the attachment, then download the csv export and check the file', 'files-download-upload-export'],
  ['the text is only in a picture on a canvas, read it and find the logo icon', 'pictures-and-painted-interfaces'],
  ['play this unfamiliar puzzle game and learn the controls', 'unfamiliar-interface-and-games'],
  ['my google ads conversions stopped recording, check the tag and gclid', 'google-ads-conversion-troubleshooting'],
  ['start a new shopify store and try the mock shop sample catalog', 'shopify-new-store-and-test-data'],
  ['read this long news article and give me only the main text without the ads', 'reading-documents-articles-and-feeds'],
  ['open the xlsx spreadsheet and the docx file and tell me what the sheets contain', 'reading-documents-articles-and-feeds'],
  ['validate my gaql query before I run it, the select and where fields', 'google-ads-gaql-validation'],
  ['pull meta ads insights with paging and avoid the rate limit error', 'meta-ads-reporting-limits-and-paging'],
  ['export all products from the shopify admin graphql api with a bulk operation', 'shopify-admin-data-safely'],
  ['write a shopifyql query to compare sales by product with the previous period', 'shopifyql-store-analytics'],
  ['set up a shopify flow workflow that tags orders and notifies staff', 'shopify-flow-automation'],
  ['add a metafield definition and a metaobject to my shopify products in custom data settings', 'shopify-custom-data-admin'],
  ['edit my shopify theme liquid code safely, duplicate it and preview before publishing', 'shopify-theme-edit-safely'],
  ['prepare my shopify app store listing and pricing plans for review submission', 'shopify-app-store-listing'],
  ['pull the google ads search terms report with quality score by device and hour', 'google-ads-reporting-recipes'],
  ['list the client accounts under my google ads manager mcc account', 'google-ads-account-hierarchy'],
  ['exclude urls from a performance max asset group url expansion', 'google-ads-pmax-asset-groups'],
  ['my google ad is disapproved for a policy violation, appeal or request an exemption', 'google-ads-policy-disapprovals'],
  ['use the google ads keyword planner for keyword ideas and forecast clicks', 'google-ads-keyword-planner'],
  ['build a lookalike custom audience and a carousel creative for facebook and instagram ads', 'meta-ads-audiences-and-creative'],
  ['how loud is this podcast mp3 and where are the silences, and what is the tempo of the song', 'media-files-listen-look-and-transcribe'],
  ['make a short intro video with a title card, a photo and background music and save it as mp4', 'making-a-video-on-the-device'],
  ['cut the best moments out of this long webinar recording, remove the silences and ums and add subtitles', 'cut-highlights-and-tidy-a-recording'],
  ['my video is too dark with a blue cast, fix the white balance and add a cinematic look and reduce the hiss in the voice', 'grade-and-clean-up-a-video'],
  ['put these leads into an excel spreadsheet with a total row and also give me a word report and a powerpoint deck', 'deliver-results-as-office-files'],
  ['find dentists in leeds on google maps and linkedin company pages, give me the direct search urls', 'known-sites-direct-urls'],
  ['find dental clinics in manchester that need a new website, qualify each as a lead with a reason and give me the contact emails', 'find-and-qualify-local-leads'],
  ['search linkedin and indeed for remote python developer jobs posted this week, compare the salaries and rank them', 'job-search-across-boards'],
  ['write a cold email sequence to these prospects with an unsubscribe line and make sure it follows gdpr and can-spam', 'draft-compliant-outreach-emails'],
  ['does this site offer webmcp tools for agents, list the registered page tools and call one', 'tools-a-page-offers-an-agent'],
];

// Near-misses: the words overlap a skill, the need is another one. None of them should put the skill that shares its words first.
const NEAR_MISS: Array<[string, string]> = [
  ['what is the weather in lisbon today', 'google-ads-search-campaigns'],
  ['write a poem about a cat', 'forms-and-business-apps'],
  ['translate this sentence into french', 'research-with-sources'],
  ['play some music', 'video-timeline-editor'],
];

describe('bundled skill triggers', () => {
  it.each(SHOULD)('"%s" finds %s first', (query, id) => {
    expect(searchSkills(query, { limit: 3 })[0]?.card.id).toBe(id);
  });
  it.each(NEAR_MISS)('"%s" does not put %s first', (query, id) => {
    const hits = searchSkills(query, { limit: 3 });
    expect(hits[0]?.card.id).not.toBe(id);
  });
  it('every bundled skill is the best answer to at least one request', () => {
    const covered = new Set(SHOULD.map(([, id]) => id));
    expect(covered.size).toBe(SKILL_CATALOG.length);
  });
});
