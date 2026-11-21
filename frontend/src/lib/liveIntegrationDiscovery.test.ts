import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLiveIntegration, liveIntegrationCategories } from './liveIntegrationDiscovery';
import type { XrogaConnectCatalogToolkit } from './xrogaConnect';

const shopify: XrogaConnectCatalogToolkit = {
  slug:'shopify',name:'Shopify',description:'Shopify commerce operations',
  logo:'https://example.com/shopify-logo.svg',xrogaGroup:'commerce-payments',
  categories:[{id:'commerce',name:'Commerce'}],
  authSchemes:['oauth2'],managedAuthSchemes:['OAUTH2'],noAuth:false,
  toolsCount:198,triggersCount:12,deprecated:false,
};

test('full Xroga Connect catalog metadata becomes navigable cards with real logo URLs',()=>{
  const card=normalizeLiveIntegration(shopify);
  assert.equal(card.id,'shopify');
  assert.equal(card.href,'/dashboard/integrations/shopify');
  assert.equal(card.logoUrl,shopify.logo);
  assert.equal(card.toolsCount,198);
  assert.equal(card.triggersCount,12);
  assert.equal(card.authHint,'OAuth option listed');
  assert.equal(card.fromLiveCatalog,true);
  assert.equal(card.mode,'app-guide');
  assert.equal(card.sourceCategory,'commerce-payments');
});

test('current provider category groups become filterable without claiming connections',()=>{
  const noAuth: XrogaConnectCatalogToolkit={
    ...shopify,slug:'public-data',name:'Public Data',xrogaGroup:'data-analytics',
    authSchemes:[],managedAuthSchemes:[],noAuth:true,logo:undefined,
    toolsCount:0,triggersCount:0,
  };
  const cards=[normalizeLiveIntegration(shopify),normalizeLiveIntegration(noAuth)];
  const categories=liveIntegrationCategories(cards);
  assert.deepEqual(categories.map(c=>c.label),['All apps','Commerce','Data Analytics']);
  assert.equal(cards[1].authHint,'No account auth listed');
  assert.ok(cards.every(c=>!Object.hasOwn(c,'connected')));
});
