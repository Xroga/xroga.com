import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../ci/toolchain.mjs';
import { outputs } from './golden-journeys.mjs';
import { validateGoldenMatrix } from './golden-schema.mjs';
export function main(){
  const read=path=>readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n');
  const matrix=JSON.parse(read('docs/xroga/golden-journey-matrix.json'));
  const ids=new Set(JSON.parse(read('docs/xroga/requirements-ledger.json')).requirements.map(row=>row.requirement_id));
  const result=validateGoldenMatrix(matrix,ids,path=>existsSync(join(root,path)));
  for(const[path,expected]of outputs({sourceSha:matrix.sourceSha}))if(read(path)!==expected)throw new Error(`Golden contract drift: ${path}`);
  console.log(JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
