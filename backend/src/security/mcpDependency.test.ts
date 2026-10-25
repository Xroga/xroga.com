import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';

// Resolve the receiver used by Cline, not an unrelated patched top-level copy.
const requireCore=createRequire(import.meta.resolve('@cline/core'));
const entry=requireCore.resolve('@modelcontextprotocol/sdk/client/auth.js');
const {auth}=await import(pathToFileURL(entry).href) as typeof import('@modelcontextprotocol/sdk/client/auth.js');
const trusted='https://trusted-auth.example.invalid',other='https://other-auth.example.invalid';
const resource='https://fixture-mcp.example.invalid/mcp';

function fixture(clientIssuer:string,tokenIssuer:string,discoveredIssuer:string) {
  const saved:OAuthTokens[]=[],redirects:URL[]=[];
  const provider:OAuthClientProvider={
    redirectUrl:'http://127.0.0.1:1/callback',
    clientMetadata:{redirect_uris:['http://127.0.0.1:1/callback'],token_endpoint_auth_method:'client_secret_post'},
    clientInformation:()=>({client_id:'synthetic-client',client_secret:'SYNTHETIC_CLIENT_CANARY',issuer:clientIssuer}),
    tokens:()=>({access_token:'SYNTHETIC_ACCESS_CANARY',refresh_token:'SYNTHETIC_REFRESH_CANARY',token_type:'Bearer',issuer:tokenIssuer}),
    saveTokens:tokens=>{saved.push(tokens);},
    redirectToAuthorization:url=>{redirects.push(url);},
    saveCodeVerifier:()=>{},codeVerifier:()=> 'synthetic-pkce-verifier',
    discoveryState:()=>({authorizationServerUrl:discoveredIssuer,resourceMetadata:{resource,authorization_servers:[discoveredIssuer]},
      authorizationServerMetadata:{issuer:discoveredIssuer,authorization_endpoint:`${discoveredIssuer}/authorize`,token_endpoint:`${discoveredIssuer}/token`,
        response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['client_secret_post']}}),
  };
  return {provider,saved,redirects};
}

test('real Cline dependency resolves the compatible patched MCP 1.x package',()=>{
  const manifest=JSON.parse(readFileSync(join(dirname(entry),'../../../package.json'),'utf8'));
  assert.equal(manifest.name,'@modelcontextprotocol/sdk');assert.equal(manifest.version,'1.32.1');
});

test('actual MCP OAuth rejects another issuer before sending the stored client secret',async()=>{
  const {provider,saved,redirects}=fixture(trusted,trusted,other);let requests=0;
  await assert.rejects(auth(provider,{serverUrl:resource,fetchFn:async()=>{requests++;throw new Error('No transport operation permitted');}}),/bound to authorization server/);
  assert.equal(requests,0);assert.equal(saved.length,0);assert.equal(redirects.length,0);
});

test('actual MCP OAuth never refreshes a token belonging to another issuer',async()=>{
  const {provider,saved,redirects}=fixture(other,trusted,other);let requests=0;
  assert.equal(await auth(provider,{serverUrl:resource,fetchFn:async()=>{requests++;throw new Error('Unexpected credential request');}}),'REDIRECT');
  assert.equal(requests,0);assert.equal(saved.length,0);assert.equal(redirects.length,1);
  const url=redirects[0];assert.equal(url.origin,other);
  assert.ok(!url.href.includes('SYNTHETIC_REFRESH_CANARY'));assert.ok(!url.href.includes('SYNTHETIC_CLIENT_CANARY'));
});

test('same-issuer MCP refresh remains compatible and preserves issuer on saved tokens',async()=>{
  const {provider,saved,redirects}=fixture(trusted,trusted,trusted);let requests=0;
  assert.equal(await auth(provider,{serverUrl:resource,fetchFn:async(input,init)=>{
    requests++;assert.equal(String(input),`${trusted}/token`);
    const body=new URLSearchParams(String(init?.body));assert.equal(body.get('grant_type'),'refresh_token');
    assert.equal(body.get('refresh_token'),'SYNTHETIC_REFRESH_CANARY');
    return new Response(JSON.stringify({access_token:'SYNTHETIC_REPLACEMENT',refresh_token:'SYNTHETIC_ROTATED',token_type:'Bearer'}),{headers:{'Content-Type':'application/json'}});
  }}),'AUTHORIZED');
  assert.equal(requests,1);assert.equal(redirects.length,0);assert.equal(saved.length,1);
  assert.equal(saved[0].issuer,trusted);assert.equal(saved[0].access_token,'SYNTHETIC_REPLACEMENT');
});
