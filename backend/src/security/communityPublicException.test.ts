import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {globalServiceExceptions} from './serviceRoleGuard.js';

test('community public exception covers only fixed public author and aggregate projections with no mutation or private columns',()=>{
  const exception=globalServiceExceptions.community_public_projection;
  assert.equal(exception.action,'select');assert.equal(exception.source,'backend/src/community/service.ts');
  assert.equal(exception.columns,'profiles:id,username,display_name,avatar_url;community_votes:post_id;community_comments:post_id,official_identity,is_hidden');
  const source=readFileSync(new URL('../community/service.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('service.ts',source,ts.ScriptTarget.Latest,true),projections:string[]=[];
  const visit=(node:ts.Node)=>{
    if(ts.isMethodDeclaration(node)&&node.name?.getText(ast)==='profiles'){
      assert.match(node.getText(ast),/\.select\('id,username,display_name,avatar_url'\)\.in\('id', unique\)/);
      projections.push('profiles');
    }
    if(ts.isMethodDeclaration(node)&&node.name?.getText(ast)==='enrichPosts'){
      const text=node.getText(ast);
      assert.match(text,/\.from\('community_votes'\)\.select\('post_id'\)\.in\('post_id', ids\)/);
      assert.match(text,/\.from\('community_comments'\)\.select\('post_id,official_identity,is_hidden'\)\.in\('post_id', ids\)/);
      assert.match(text,/if \(bool\(comment, 'is_hidden'\)\) continue/);
      assert.match(text,/\.eq\('user_id', viewerId\)/,'Viewer vote remains a distinct actor-scoped query');
      assert.doesNotMatch(text,/\.(insert|update|upsert|delete)\(/);
      projections.push('enrichPosts');
    }
    ts.forEachChild(node,visit);
  };visit(ast);assert.deepEqual(projections,['profiles','enrichPosts']);
  assert.match(exception.reason,/no insert, update, delete/);
  const staff=globalServiceExceptions.community_current_staff_reads;
  assert.equal(staff.source,exception.source);assert.equal(staff.action,'select');
  assert.match(staff.reason,/same statement snapshot/);assert.match(staff.reason,/Demotion denies subsequent reads/);
});
