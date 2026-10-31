// scripts/browser/run-sandbox-probe.mts
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";

// backend/src/workers/containerSpec.ts
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
var SpecError = class extends Error {
  violations;
  constructor(violations, notes) {
    super(`unsafe browser worker container: ${[...new Set(violations)].join(", ")} (${notes.slice(0, 6).join("; ")})`);
    this.name = "SpecError";
    this.violations = violations;
  }
};
var SPEC_CEILINGS = Object.freeze({ memoryMb: 4096, cpus: 4, pidsLimit: 1024, shmSizeMb: 1024, tmpfsMb: 4096 });
var REQUIRED_EGRESS_DENY = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "::1/128",
  "fc00::/7",
  "fe80::/10"
];
var SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|AUTH|SESSION|DATABASE_URL|DSN)/i;
var FORBIDDEN_MOUNT_TARGETS = /^(\/var\/run\/docker\.sock|\/run\/docker\.sock|\/proc|\/sys|\/dev|\/etc|\/root|\/home|\/var\/lib\/docker|\/)(\/|$)/;
function assertContainerSpecSafe(spec2, opts = {}) {
  const v = [];
  const n = [];
  const bad = (code, note) => {
    v.push(code);
    n.push(note);
  };
  if (spec2.privileged !== false) bad("PRIVILEGED", "privileged must be false");
  if (!/^[1-9][0-9]*:[1-9][0-9]*$/.test(spec2.user ?? "")) bad("ROOT_USER", "user must be a numeric non-root uid:gid");
  if (!Array.isArray(spec2.capAdd) || spec2.capAdd.length) bad("CAPABILITY_ADDED", "no capability may be added");
  if (!Array.isArray(spec2.capDrop) || !spec2.capDrop.map((c) => c.toUpperCase()).includes("ALL")) bad("CAPABILITIES_NOT_DROPPED", "capDrop must include ALL");
  if (spec2.readOnlyRootFilesystem !== true) bad("WRITABLE_ROOT", "the root filesystem must be read-only");
  if (spec2.noNewPrivileges !== true) bad("PRIVILEGE_ESCALATION", "no-new-privileges must be on");
  if (!spec2.seccompProfile || /unconfined/i.test(spec2.seccompProfile)) bad("SECCOMP_DISABLED", "a seccomp profile is required");
  else if (opts.repoRoot && !existsSync(isAbsolute(spec2.seccompProfile) ? spec2.seccompProfile : resolve(opts.repoRoot, spec2.seccompProfile))) bad("SECCOMP_MISSING", "the seccomp profile file does not exist");
  for (const ns of ["ipc", "pid", "uts"]) if (spec2[ns] !== "private") bad("HOST_NAMESPACE", `${ns} must be private`);
  if (spec2.network?.mode === "host" || /^container:/.test(spec2.network?.mode ?? "")) bad("HOST_NETWORK", "host or shared network namespace");
  const mode = spec2.network?.mode;
  if (mode === "internal") {
    if (!/^[a-z0-9][a-z0-9_.-]{2,40}$/.test(spec2.network.name ?? "")) bad("NETWORK_NOT_RESTRICTED", "an internal network needs a name");
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(spec2.network.proxyHost ?? "")) bad("NETWORK_NOT_RESTRICTED", "the egress proxy must be one single-label host on that network");
    if (!Number.isInteger(spec2.network.proxyPort) || spec2.network.proxyPort < 1 || spec2.network.proxyPort > 65535) bad("NETWORK_NOT_RESTRICTED", "the egress proxy needs a port");
  } else if (mode !== "none" && mode !== "host" && !/^container:/.test(mode ?? "")) {
    bad("NETWORK_NOT_RESTRICTED", "network mode must be internal (proxy as the only peer) or none");
  }
  if (!Array.isArray(spec2.network?.publishedPorts) || spec2.network.publishedPorts.length) bad("PUBLISHED_PORT", "the browser worker publishes no port");
  if (!Array.isArray(spec2.network?.extraHosts) || spec2.network.extraHosts.length) bad("EXTRA_HOSTS", "no extra host mappings (they bypass DNS policy)");
  for (const m of spec2.mounts ?? []) {
    if (m.type !== "tmpfs") bad("FORBIDDEN_MOUNT", "only tmpfs mounts are allowed: no bind, volume or socket");
    else if (FORBIDDEN_MOUNT_TARGETS.test(m.target) || !isAbsolute(m.target)) bad("FORBIDDEN_MOUNT", `mount target ${String(m.target).slice(0, 40)} is not allowed`);
    if (!Number.isFinite(m.sizeMb) || m.sizeMb < 1 || m.sizeMb > SPEC_CEILINGS.tmpfsMb) bad("UNBOUNDED_RESOURCES", "a tmpfs needs a bounded size");
    const o = m.options ?? [];
    if (!o.includes("nosuid") || !o.includes("nodev") || o.includes("suid") || o.includes("exec") || !o.includes("noexec")) bad("TMPFS_EXEC_OR_SUID", `tmpfs ${m.target} must be nosuid,nodev,noexec`);
  }
  const within = (x, max) => Number.isFinite(x) && x > 0 && x <= max;
  if (!within(spec2.memoryMb, SPEC_CEILINGS.memoryMb) || !within(spec2.memorySwapMb, SPEC_CEILINGS.memoryMb) || spec2.memorySwapMb < spec2.memoryMb) bad("UNBOUNDED_RESOURCES", "memory and swap must be bounded");
  else if (spec2.memorySwapMb !== spec2.memoryMb) bad("UNBOUNDED_RESOURCES", "swap must equal memory (no swap)");
  if (!within(spec2.cpus, SPEC_CEILINGS.cpus)) bad("UNBOUNDED_RESOURCES", "cpus must be bounded");
  if (!within(spec2.pidsLimit, SPEC_CEILINGS.pidsLimit)) bad("UNBOUNDED_RESOURCES", "a process limit is required");
  if (!within(spec2.shmSizeMb, SPEC_CEILINGS.shmSizeMb)) bad("UNBOUNDED_RESOURCES", "shared memory must be bounded");
  for (const k of Object.keys(spec2.env ?? {})) if (SECRET_ENV.test(k)) bad("SECRET_ENV", `environment variable ${k.slice(0, 30)} looks like a secret`);
  if (!/@sha256:[0-9a-f]{64}$/.test(spec2.image ?? "") && !/^xroga-browser-worker:[A-Za-z0-9._-]+$/.test(spec2.image ?? "")) bad("IMAGE_NOT_PINNED", "the image must be pinned by digest (a locally built tag is allowed only for the probe)");
  if (spec2.egress?.enforcement !== "required-at-deploy") bad("EGRESS_RULES_MISSING", "egress enforcement must be declared");
  const deny = new Set(spec2.egress?.denyCidrs ?? []);
  const missing = REQUIRED_EGRESS_DENY.filter((c) => !deny.has(c));
  if (missing.length) bad("EGRESS_RULES_MISSING", `egress deny list lacks ${missing.slice(0, 3).join(", ")}`);
  if (v.length) throw new SpecError(v, n);
}
function dockerRunArgs(spec2, opts) {
  const args = ["--rm", ...opts.name ? ["--name", opts.name] : []];
  args.push("--user", spec2.user, "--read-only", "--security-opt", "no-new-privileges:true");
  args.push("--security-opt", `seccomp=${resolve(opts.repoRoot, spec2.seccompProfile)}`);
  for (const c of spec2.capDrop) args.push("--cap-drop", c);
  args.push("--ipc", "private");
  args.push("--network", spec2.network.mode === "internal" ? spec2.network.name : "none");
  for (const m of spec2.mounts) args.push("--tmpfs", `${m.target}:rw,${m.options.join(",")},size=${m.sizeMb}m`);
  args.push("--shm-size", `${spec2.shmSizeMb}m`, "--memory", `${spec2.memoryMb}m`, "--memory-swap", `${spec2.memorySwapMb}m`, "--cpus", String(spec2.cpus), "--pids-limit", String(spec2.pidsLimit));
  for (const [k, val] of Object.entries(spec2.env)) args.push("--env", `${k}=${val}`);
  return args;
}
function assertDockerfileSafe(text) {
  const v = [];
  const n = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const from = lines.filter((l) => /^FROM\s/i.test(l));
  if (!from.length || from.some((l) => !/@sha256:[0-9a-f]{64}/.test(l))) {
    v.push("IMAGE_NOT_PINNED");
    n.push("every FROM must be pinned by digest");
  }
  const users = lines.filter((l) => /^USER\s/i.test(l));
  const last = users.at(-1)?.replace(/^USER\s+/i, "").trim() ?? "";
  if (!/^[1-9][0-9]*(:[1-9][0-9]*)?$/.test(last)) {
    v.push("ROOT_USER");
    n.push("the final USER must be a numeric non-root id");
  }
  if (/--no-sandbox|--disable-setuid-sandbox|--disable-web-security|--ignore-certificate-errors/.test(text)) {
    v.push("SECCOMP_DISABLED");
    n.push("a sandbox-disabling flag appears in the Dockerfile");
  }
  if (/\b(curl|wget)\b[^\n|]*\|\s*(ba)?sh\b/.test(text) || /^ADD\s+https?:/im.test(text)) {
    v.push("IMAGE_NOT_PINNED");
    n.push("remote scripts or ADD from a URL are not allowed");
  }
  if (/chmod\s+(-R\s+)?[0-7]*7[0-7]{0,2}\b/.test(text) && /chmod\s+(-R\s+)?(0?777|a\+rwx)/.test(text)) {
    v.push("WRITABLE_ROOT");
    n.push("world-writable permissions");
  }
  if (/^(ENV|ARG)\s+\S*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)\S*\s*=?/im.test(text)) {
    v.push("SECRET_ENV");
    n.push("a secret-looking ENV or ARG");
  }
  if (/^COPY\s+.*(\.env|id_rsa|\.pem|credentials)/im.test(text)) {
    v.push("SECRET_ENV");
    n.push("a secret-looking file is copied into the image");
  }
  if (/^EXPOSE\s/im.test(text)) {
    v.push("PUBLISHED_PORT");
    n.push("the browser worker exposes no port");
  }
  if (v.length) throw new SpecError(v, n);
}

// scripts/browser/run-sandbox-probe.mts
var repoRoot = resolve2(dirname(fileURLToPath(import.meta.url)), "../..");
var arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
var image = arg("--image", "xroga-browser-worker:phase2-probe");
var label = arg("--label", "DOCKER_LOCAL_TESTED");
var platform = arg("--platform");
var quick = process.argv.includes("--quick");
var outFile = arg("--out", resolve2(repoRoot, "docs/infra/batch-1.5/phase-2/evidence/browser-sandbox-probe.json"));
var docker = (args, opts = {}) => spawnSync("docker", args, { encoding: "utf8", timeout: opts.timeout ?? 18e4, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
var sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
var specPath = resolve2(repoRoot, "deploy/browser-worker/container-spec.json");
var spec = JSON.parse(readFileSync(specPath, "utf8"));
assertContainerSpecSafe(spec, { repoRoot });
assertDockerfileSafe(readFileSync(resolve2(repoRoot, "deploy/browser-worker/Dockerfile"), "utf8"));
if (process.argv.includes("--build")) {
  const b = docker(["build", ...platform ? ["--platform", platform] : [], "-t", image, resolve2(repoRoot, "deploy/browser-worker")], { timeout: 9e5 });
  if (b.status !== 0) {
    console.error(b.stderr.slice(-2e3));
    process.exit(5);
  }
}
var info = docker(["info", "--format", "{{json .}}"]);
if (info.status !== 0) {
  console.error("docker daemon is not reachable");
  process.exit(5);
}
var di = JSON.parse(info.stdout);
var imageId = docker(["image", "inspect", image, "--format", "{{.Id}}"]).stdout.trim();
var imageArch = docker(["image", "inspect", image, "--format", "{{.Architecture}}"]).stdout.trim();
var expectEnv = [
  "XROGA_EXPECT_UID",
  String(spec.user.split(":")[0]),
  "XROGA_EXPECT_MEMORY_BYTES",
  String(spec.memoryMb * 1024 * 1024),
  "XROGA_EXPECT_PIDS",
  String(spec.pidsLimit),
  "XROGA_EXPECT_CPUS",
  String(spec.cpus),
  "XROGA_EXPECT_SHM_BYTES",
  String(spec.shmSizeMb * 1024 * 1024),
  "XROGA_EXPECT_TMPFS",
  spec.mounts.map((m) => m.target).join(","),
  ...platform ? ["XROGA_PROBE_LAUNCH_TIMEOUT_MS", "240000"] : []
].flatMap((v, i, a) => i % 2 === 0 ? ["--env", `${v}=${a[i + 1]}`] : []);
var netName = spec.network.mode === "internal" ? spec.network.name : null;
var createdNet = netName ? docker(["network", "create", "--internal", netName]).status === 0 : false;
var names = [];
function run(name, args) {
  const cname = `xroga-probe-${name}-${Date.now() % 1e5}`;
  names.push(cname);
  const started = Date.now();
  const r = docker(["run", "--name", cname, ...args.filter((a) => a !== "--rm"), ...platform ? ["--platform", platform] : [], ...expectEnv, image]);
  docker(["rm", "-f", cname]);
  let report = null;
  try {
    report = JSON.parse(r.stdout);
  } catch {
  }
  return { name, exitCode: r.status, ms: Date.now() - started, verdict: report?.verdict ?? "NO_REPORT", report, stderrTail: report ? void 0 : (r.stderr ?? "").slice(-600) };
}
var base = dockerRunArgs(spec, { repoRoot });
var without = (flags, opt, valuePrefix) => {
  const out = [];
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === opt && (valuePrefix === void 0 || String(flags[i + 1]).startsWith(valuePrefix))) {
      i++;
      continue;
    }
    out.push(flags[i]);
  }
  return out;
};
var withoutFlag = (flags, opt) => flags.filter((f) => f !== opt);
var replaceValue = (flags, opt, valuePrefix, next) => flags.map((f, i) => flags[i - 1] === opt && f.startsWith(valuePrefix) ? next : f);
var failingChecks = (r) => Object.entries(r.report?.conformance?.checks ?? {}).filter(([, ok]) => !ok).map(([k]) => k);
var hardened;
var control;
var variants = [
  { id: "root-user", description: "container started as root (--user 0:0)", mustFail: "runsAsExpectedNonRootUser" },
  { id: "writable-root", description: "root filesystem writable (no --read-only)", mustFail: "rootFilesystemReadOnly" },
  { id: "capabilities-kept", description: "default capabilities kept (no --cap-drop ALL)", mustFail: "noCapabilities" },
  { id: "privilege-escalation-allowed", description: "no-new-privileges removed", mustFail: "noNewPrivileges" },
  { id: "no-resource-limits", description: "memory, swap, cpu and pid limits removed", mustFail: "memoryLimitMatches" },
  { id: "tmpfs-executable", description: "/tmp without noexec", mustFail: "tmpfsIsNosuidNodevNoexec" }
];
var variantArgs = {
  "root-user": replaceValue(base, "--user", "10001", "0:0"),
  "writable-root": withoutFlag(base, "--read-only"),
  "capabilities-kept": without(base, "--cap-drop"),
  "privilege-escalation-allowed": without(base, "--security-opt", "no-new-privileges"),
  "no-resource-limits": ["--memory", "--memory-swap", "--cpus", "--pids-limit"].reduce((f, o) => without(f, o), base),
  // Docker adds noexec to a tmpfs by default, so the weakened mount has to ask for exec explicitly
  "tmpfs-executable": replaceValue(base, "--tmpfs", "/tmp:", "/tmp:rw,exec,nosuid,nodev,size=512m")
};
try {
  hardened = run("hardened", base);
  control = run("control", without(base, "--security-opt", "seccomp="));
  if (!quick) for (const v of variants) v.run = run(v.id, variantArgs[v.id]);
} finally {
  if (createdNet && netName) docker(["network", "rm", netName]);
}
var leftoverContainers = docker(["ps", "-a", "--filter", "name=xroga-probe-", "--format", "{{.Names}}"]).stdout.split("\n").filter(Boolean);
var leftoverNetworks = netName ? docker(["network", "ls", "--filter", `name=^${netName}$`, "--format", "{{.Name}}"]).stdout.split("\n").filter(Boolean) : [];
var variantResults = quick ? [] : variants.map((v) => ({ id: v.id, description: v.description, mustFail: v.mustFail, failedChecks: failingChecks(v.run), detected: failingChecks(v.run).includes(v.mustFail), probeVerdict: v.run.verdict, exitCode: v.run.exitCode }));
var hardenedOk = hardened.exitCode === 0 && hardened.verdict === "SANDBOX_ON" && hardened.report?.conformance?.ok === true && hardened.report?.cleanup?.ok === true;
var controlOk = control.verdict === "BLOCKED";
var variantsOk = quick ? true : variantResults.every((v) => v.detected);
var cleanupOk = leftoverContainers.length === 0 && leftoverNetworks.length === 0;
var record = {
  evidenceClass: label,
  notOci: !/OCI/.test(label),
  platform: platform ?? "host default",
  quick,
  claim: "Under the reviewed container spec the probe observes a conforming container and Chromium starts with its sandbox ON, with no browser process left behind; under Docker's default seccomp profile the sandbox does not start; each of six weakened variants is detected by the probe by name.",
  at: (/* @__PURE__ */ new Date()).toISOString(),
  host: { docker: di.ServerVersion, os: di.OperatingSystem, kernel: di.KernelVersion, arch: di.Architecture, securityOptions: di.SecurityOptions },
  image: { name: image, id: imageId, architecture: imageArch },
  inputs: { containerSpecSha256: sha(specPath), seccompProfileSha256: sha(resolve2(repoRoot, spec.seccompProfile)), dockerfileSha256: sha(resolve2(repoRoot, "deploy/browser-worker/Dockerfile")), probeSha256: sha(resolve2(repoRoot, "deploy/browser-worker/sandboxProbe.mjs")), packageJsonSha256: sha(resolve2(repoRoot, "deploy/browser-worker/package.json")), packageLockSha256: sha(resolve2(repoRoot, "deploy/browser-worker/package-lock.json")) },
  runFlags: base.map((a) => a.split(repoRoot).join("<repo>")),
  hardened,
  control,
  weakenedVariants: variantResults,
  cleanup: { leftoverContainers, leftoverNetworks, ok: cleanupOk },
  verdicts: { hardenedOk, controlOk, variantsOk, cleanupOk },
  limits: [
    "Proves the sandbox can be established and the container conforms under these flags on THIS host, not on any other (the OCI host and an ARM64 shape are separate runs).",
    "The kernel setting that matters is unprivileged user namespaces (user.max_user_namespaces > 0); the report records it."
  ]
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(record, null, 2)}
`);
console.log(JSON.stringify({ hardened: hardened.verdict, hardenedConformance: hardened.report?.conformance?.ok, control: control.verdict, variantsDetected: variantResults.map((v) => `${v.id}:${v.detected}`), cleanupOk, out: outFile }, null, 2));
process.exitCode = hardened.verdict === "NO_REPORT" ? 5 : hardened.verdict !== "SANDBOX_ON" ? 3 : !hardenedOk || !cleanupOk ? 4 : !controlOk || !variantsOk ? 6 : 0;
