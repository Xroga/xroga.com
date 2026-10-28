import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
function testCall(source,marker){
  const file=ts.createSourceFile('proof.ts',source.replace(/\r\n/g,'\n'),ts.ScriptTarget.Latest,true),matches=[];
  function visit(node){
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['test','it'].includes(node.expression.text)
      &&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===marker)matches.push(node.getText(file));
    ts.forEachChild(node,visit);
  }
  visit(file);assert.equal(matches.length,1,'Historical proof test must be unique and present');return matches[0];
}

/** Preserve a historical candidate hash only with exact current-file binding and
 * a byte-identical test invocation. This grants no proof or security acceptance.
 * Other tests in the file must still pass the unchanged complete regression job.
 */
export function verifyHistoricalProofBinding(binding,before,after){
  assert.equal(binding.scope,'UNCHANGED_TEST_HISTORICAL_CANDIDATE_NOT_ACCEPTANCE');
  assert.equal(hash(before),binding.historicalSourceSha256,'Historical proof file drift');
  assert.equal(hash(after),binding.currentSourceSha256,'Current proof file drift');
  const original=testCall(before,binding.marker),current=testCall(after,binding.marker);
  assert.equal(original,current,'Historical proof test changed');
  assert.equal(hash(current),binding.testCallSha256,'Historical proof test binding drift');
  return binding.historicalSourceSha256;
}
