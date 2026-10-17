import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {targets,patchedSource,verifyOrApply} from '../../backend/scripts/security-dependency-patches.mjs';
const require=createRequire(import.meta.url);

test('downstream security patches are exact, idempotent and reject version/source tampering',()=>{
  const proof=verifyOrApply();assert.equal(proof.npmAdvisoriesWaived,false);
  for(const target of targets){
    const root=dirname(require.resolve(`${target.name}/package.json`));const installed=readFileSync(join(root,target.file),'utf8');
    assert.equal(patchedSource(installed,target),installed);
    assert.throws(()=>patchedSource(installed+'\n// unknown change',target),/Unreviewed dependency source/);
    assert.ok(readFileSync(join(root,'LICENSE'),'utf8').length>100);
  }
});

test('actual braces public and direct AST APIs reject adversarial depth without stack exhaustion',()=>{
  const child=spawnSync(process.execPath,['-e',String.raw`
    const assert=require('node:assert/strict'),braces=require('braces');
    const huge='{'.repeat(4000)+'a,b'+'}'.repeat(4000);
    const parens='('.repeat(4000)+'a'+')'.repeat(4000);
    for(const pattern of [huge,parens,'{'.repeat(4000),'('.repeat(4000)])
      for(const fn of [braces,braces.parse,braces.compile,braces.expand,braces.stringify])
        assert.throws(()=>fn(pattern),e=>e instanceof SyntaxError&&/nesting limit/.test(e.message));
    let ast={type:'text',value:'a'};
    for(let i=0;i<1000;i++)ast={type:'root',nodes:[ast]};
    for(const fn of [braces.compile,braces.expand,braces.stringify])
      assert.throws(()=>fn(ast),e=>e instanceof SyntaxError&&/nesting limit/.test(e.message));
    const cyclic={type:'root',nodes:[]};cyclic.nodes.push(cyclic);
    for(const fn of [braces.compile,braces.expand,braces.stringify])
      assert.throws(()=>fn(cyclic),e=>e instanceof SyntaxError&&/nesting limit/.test(e.message));
    assert.equal(typeof braces.compile('{'.repeat(100)+'a,b'+'}'.repeat(100)),'string');
  `],{cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);
});

test('actual brace receivers preserve ordinary glob, range, quoting and filesystem discovery behavior',()=>{
  const braces=require('braces'),micromatch=require('micromatch'),fg=require('fast-glob');
  assert.deepEqual(braces.expand('src/{one,two}/{1..3}.ts'),['src/one/1.ts','src/one/2.ts','src/one/3.ts','src/two/1.ts','src/two/2.ts','src/two/3.ts']);
  assert.equal(braces.stringify(braces.parse('foo/{a,b}/bar')),'foo/{a,b}/bar');
  assert.deepEqual(braces.expand('literal\\{a,b\\}'),['literal{a,b}']);
  assert.deepEqual(micromatch(['src/a.ts','src/b.ts','src/c.js'],['src/{a,b}.ts']),['src/a.ts','src/b.ts']);
  const found=fg.sync('backend/src/{routes,security}/github*.ts',{cwd:new URL('../../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
  assert.ok(found.includes('backend/src/routes/github.ts'));
  const micromatchReceiver=createRequire(require.resolve('micromatch'));
  assert.equal(micromatchReceiver('braces/package.json').version,'3.0.3');
  const frontend=createRequire(new URL('../../frontend/package.json',import.meta.url));
  const tailwind=createRequire(frontend.resolve('tailwindcss'));
  const watcher=createRequire(tailwind.resolve('chokidar'));
  assert.equal(watcher('braces/package.json').version,'3.0.3');
});

test('actual node-forge receiver rejects nested DigestAlgorithm extras while preserving RSA and PKCS12 consumers',()=>{
  const forge=require('node-forge'),asn=forge.asn1;
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:1024,publicExponent:65537,
    privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'pkcs1',format:'pem'}});
  const privateRsa=forge.pki.privateKeyFromPem(privateKey),publicRsa=forge.pki.publicKeyFromPem(publicKey);
  const md=forge.md.sha256.create();md.update('synthetic parser regression');const bytes=md.digest().bytes();
  const oid=()=>asn.create(asn.Class.UNIVERSAL,asn.Type.OID,false,asn.oidToDer(forge.oids.sha256).getBytes());
  const nil=()=>asn.create(asn.Class.UNIVERSAL,asn.Type.NULL,false,'');
  const signature=children=>privateRsa.sign(asn.toDer(asn.create(asn.Class.UNIVERSAL,asn.Type.SEQUENCE,true,[
    asn.create(asn.Class.UNIVERSAL,asn.Type.SEQUENCE,true,children),
    asn.create(asn.Class.UNIVERSAL,asn.Type.OCTETSTRING,false,bytes),
  ])).getBytes(),null);
  for(const children of [[oid()],[oid(),nil()]])assert.equal(publicRsa.verify(bytes,signature(children)),true);
  for(const children of [[oid(),nil(),nil()],[oid(),oid()],[oid(),nil(),oid()],
    [oid(),asn.create(asn.Class.UNIVERSAL,asn.Type.OCTETSTRING,false,'garbage')]])
    assert.throws(()=>publicRsa.verify(bytes,signature(children)),/DigestInfo/);
  assert.equal(publicRsa.verify(bytes,privateRsa.sign(md)),true);
  assert.equal(publicRsa.verify(forge.md.sha256.create().update('different').digest().bytes(),privateRsa.sign(md)),false);
  const cert=forge.pki.createCertificate();cert.publicKey=publicRsa;cert.serialNumber='01';
  cert.validity.notBefore=new Date('2026-01-01');cert.validity.notAfter=new Date('2027-01-01');
  cert.setSubject([{name:'commonName',value:'synthetic.invalid'}]);cert.setIssuer(cert.subject.attributes);
  cert.sign(privateRsa,forge.md.sha256.create());assert.equal(cert.verify(cert),true);
  const pkcs12=forge.pkcs12.toPkcs12Asn1(privateRsa,[cert],'synthetic-password',{algorithm:'3des',friendlyName:'fixture'});
  const jks=require('jks-js');const extracted=jks.toPem(Buffer.from(asn.toDer(pkcs12).getBytes(),'binary'),'synthetic-password');
  assert.ok(Object.values(extracted).some(entry=>entry.cert?.includes('BEGIN CERTIFICATE')&&entry.key?.includes('PRIVATE KEY')));
  const receiver=createRequire(require.resolve('jks-js'));assert.equal(receiver.resolve('node-forge'),require.resolve('node-forge'));
});
