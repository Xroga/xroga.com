import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
export function validatePatchedPostcss(version) {
  const [major,minor,patch]=version.split('.').map(Number);
  if(!(major>8||(major===8&&(minor>5||(minor===5&&patch>=18)))))throw new Error('Resolved PostCSS is not patched');
}
export function verifyNextPostcss() {
  // Resolve through the real workspace/Next module graph, not a guessed node_modules layout.
  // Both standalone and hoisted installs must use their frozen, approved dependency.
  const frontend=createRequire(join(root,'frontend/package.json'));
  const nextManifest=frontend.resolve('next/package.json');
  const next=createRequire(nextManifest);
  const expected=JSON.parse(readFileSync(join(root,'frontend/package.json'),'utf8')).devDependencies.postcss;
  const versions=[frontend,next].map(require=>{
    const pkg=JSON.parse(readFileSync(require.resolve('postcss/package.json'),'utf8'));
    if(pkg.name!=='postcss'||pkg.version!==expected)throw new Error('PostCSS resolution differs from the exact approved lock pin');
    validatePatchedPostcss(pkg.version);return pkg.version;
  });
  return {frontend:versions[0],next:versions[1]};
}
// Fail closed instead of modifying installed packages or hiding lock/resolution drift.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify({verified_next_postcss:verifyNextPostcss()}));
