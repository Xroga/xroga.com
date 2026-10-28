import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('actual pipeline native publication shows approval without claiming upload or starting another action', async () => {
  const source = readFileSync(new URL('./pipeline.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  // Free-path artifacts for Chrome / Electron after sticky push');
  const end = source.indexOf('  // Expo: auto-trigger EAS build', start);
  assert.ok(start > 0 && end > start);
  const snippet = source.slice(start, end);
  const javascript = ts.transpileModule(`globalThis.run=async()=>{${snippet}\nreturn {chromeZipOk,electronZipOk,electronInstallerOk,nativePublicationPending};}`, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  for (const kind of ['chrome', 'electron']) for(const storeDenied of [false,true]) {
    const events: Array<{status: string; message: string}> = [];
    let extraActions = 0, storePreparations=0;
    const artifact={fileId:'synthetic-private-artifact'};
    const pending = {ok: false, needsConfirmation: true, preparedArtifact:artifact, reviewUrl: '/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111'};
    const noAction = async () => {extraActions++; throw new Error('Unapproved action must not run');};
    const context: Record<string, unknown> = {githubPushConfirmed: true, githubRepoName: 'Owner/repo', productScaffoldKind: kind, opts: {userId: 'owner'}, tenantContext: {}, nextFiles: [], commitSha: 'a'.repeat(40),
      emit: (event: {status: string; message: string}) => events.push(event), todos: () => [], console: {warn: () => {}},
      shipChromeExtensionZip: async () => pending, shipElectronPortableZip: async () => pending,
      syncElectronSigningSecretsToGitHub: noAction, triggerElectronDesktopRelease: noAction, waitForDesktopReleaseZip: noAction,
      publishChromeExtensionToStore:async(input:{artifact:unknown;zip?:unknown;tenantContext:unknown})=>{storePreparations++;assert.equal(input.artifact,artifact);assert.equal(input.zip,undefined);assert.equal(input.tenantContext,context.tenantContext);if(storeDenied)throw new Error('Synthetic store denial');return{needsConfirmation:true,reviewUrl:'/dashboard/actions/confirm/22222222-2222-4222-8222-222222222222'};},packageBuildZip: noAction};
    vm.runInNewContext(javascript, context, {timeout: 1000});
    const result = await (context.run as () => Promise<Record<string, boolean>>)();
    assert.equal(result.nativePublicationPending, true);
    assert.equal(result.chromeZipOk, false); assert.equal(result.electronZipOk, false); assert.equal(result.electronInstallerOk, false);
    assert.equal(extraActions, 0);
    assert.equal(storePreparations,kind==='chrome'?1:0);
    assert.ok(events.some(event => event.status === 'confirmation_required' && event.message.includes(pending.reviewUrl)));
    assert.equal(events.some(event => ['packaged', 'zip_ready', 'cws_submitted', 'release_failed', 'package_failed'].includes(event.status)), false);
  }
});
