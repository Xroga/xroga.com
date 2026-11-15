import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicCatalogLogoUrl, publicCatalogProjection } from './publicCatalogProjection.js';
import type { XrogaConnectCatalogToolkit } from './composioClient.js';

const template: XrogaConnectCatalogToolkit = {
  slug:'alpaca',name:'Alpaca',
  description:'Brokerage and trading APIs for market data and orders.',
  logo:'https://cdn.example.org/logos/alpaca.svg',
  xrogaGroup:'finance-accounting',
  categories:[{id:'finance',name:'Finance'}],
  authSchemes:['OAUTH2'],managedAuthSchemes:['OAUTH2'],noAuth:false,
  triggersCount:2,toolsCount:14,deprecated:false,
};

test('public projection shares genuine catalog metadata but never account data',()=>{
  const shared={...template,connected:true,connectedAccountId:'acct_secret',apiKey:'TOP_SECRET'};
  const output=publicCatalogProjection([shared]);
  assert.equal(output.length,1);
  assert.equal(output[0].slug,'alpaca');
  assert.equal(output[0].name,'Alpaca');
  assert.equal(output[0].description,template.description);
  assert.equal(output[0].logo,template.logo);
  assert.equal(output[0].toolsCount,14);
  assert.equal(output[0].triggersCount,2);
  assert.ok(!('connected' in output[0]));
  assert.ok(!('connectedAccountId' in output[0]));
  assert.ok(!('apiKey' in output[0]));
});

test('hide custom MCP, deprecated and duplicate slugs from anonymous catalog',()=>{
  const result=publicCatalogProjection([
    {...template,slug:'custom_user_vault',name:'Private Server'},
    {...template,slug:'alpaca',deprecated:true},
    template,
    {...template,description:'Duplicate'},
    {...template,slug:'bad space',name:'Invalid'},
  ]);
  assert.equal(result.length,1);
  assert.equal(result[0].description,template.description);
});

test('logo URLs are HTTPS public hosts only',()=>{
  assert.equal(publicCatalogLogoUrl('https://cdn.example.org/logo.png'),'https://cdn.example.org/logo.png');
  for(const url of [
    'javascript:alert(1)', 'data:image/png;base64,aaaa', 'http://example.org/a.png',
    'https://user:secret@example.org/a.png','https://127.0.0.1/logo',
    'https://localhost/logo','https://foo.local/logo','https://[::1]/logo',
  ]) assert.equal(publicCatalogLogoUrl(url),undefined,url);
});

test('descriptions are never manufactured when upstream provides none',()=>{
  const out=publicCatalogProjection([{...template,slug:'without-description',description:undefined}]);
  assert.equal(out.length,1);
  assert.equal(out[0].description,undefined);
});
