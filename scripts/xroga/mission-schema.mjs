import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../ci/toolchain.mjs';
import { missionJsonSchema } from './mission-policy.mjs';
writeFileSync(join(root,'docs/xroga/mission-manifest.schema.json'),JSON.stringify(missionJsonSchema,null,2)+'\n');
console.log('GENERATED_CANONICAL_MISSION_SCHEMA');
