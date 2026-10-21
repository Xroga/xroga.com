import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validatePatchedPostcss,verifyNextPostcss} from '../enforce-next-postcss.mjs';
test('approved PostCSS must resolve through both actual workspace and Next module graphs',()=>{
  assert.deepEqual(verifyNextPostcss(),{frontend:'8.5.24',next:'8.5.24'});
  for(const value of ['7.0.0','8.4.31','8.5.17','not-a-version'])assert.throws(()=>validatePatchedPostcss(value));
  validatePatchedPostcss('8.5.24');
});
