// Derives seccomp-chromium.json from Docker's default seccomp profile.
//
// Chromium's sandbox needs unprivileged user namespaces: clone(CLONE_NEWUSER|CLONE_NEWPID...), unshare and setns, and then chroot()
// into an empty directory inside the new namespace (observed failure without it: `Check failed: sys_chroot("/proc/self/fdinfo/") == 0`).
// Docker's default profile only allows those with CAP_SYS_ADMIN / CAP_SYS_CHROOT, which this container must never have (all capabilities
// are dropped). The fix is the profile below: the default profile PLUS exactly these five syscalls, unconditionally. Nothing else is relaxed.
// Each is still checked by the kernel against the caller's capabilities: with every capability dropped, outside a user namespace the
// calls fail; they succeed only against the namespace the sandbox just created for itself.
//
//   node derive-seccomp.mjs <path to moby default.json>   -> writes seccomp-chromium.json next to this script
//   node derive-seccomp.mjs --check                        -> re-derives from the pinned base and fails if the committed file differs
//
// Base profile: https://github.com/moby/profiles/blob/6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef/seccomp/default.json (commit date 2026-09-17)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE_SHA256 = '6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6';
const BASE_URL = 'https://raw.githubusercontent.com/moby/profiles/6fe7deb1b9fb7c0397a4593480d7d22b9ee8caef/seccomp/default.json';
const OUT = join(here, 'seccomp-chromium.json');
const EXTRA = { names: ['clone', 'clone3', 'unshare', 'setns', 'chroot'], action: 'SCMP_ACT_ALLOW', comment: 'Chromium sandbox: unprivileged user namespaces. Added by derive-seccomp.mjs; nothing else differs from the Docker default.' };

const check = process.argv[2] === '--check';
let basePath = check ? join(here, '.moby-default-seccomp.json') : process.argv[2];
let text;
if (basePath && existsSync(basePath)) text = readFileSync(basePath);
else {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error(`could not fetch the pinned base profile: ${res.status}`);
  text = Buffer.from(await res.arrayBuffer());
}
const got = createHash('sha256').update(text).digest('hex');
if (got !== BASE_SHA256) throw new Error(`base profile sha256 ${got} does not match the pinned ${BASE_SHA256}`);

const profile = JSON.parse(text.toString('utf8'));
profile.syscalls.push(EXTRA);
const derived = `${JSON.stringify(profile, null, 2)}\n`;
if (check) {
  if (readFileSync(OUT, 'utf8') !== derived) { console.error('seccomp-chromium.json differs from the derivation'); process.exitCode = 1; } // exitCode, not exit(): exit() right after fetch() aborts libuv on Windows
  else console.log('seccomp-chromium.json matches its derivation');
} else {
  writeFileSync(OUT, derived);
  console.log(`wrote ${OUT} (${profile.syscalls.length} rules; base sha256 ${got})`);
}
