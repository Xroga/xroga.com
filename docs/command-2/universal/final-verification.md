# M19 — live universal verification

**Result: not verified. One precise blocker, stated below.**

Command 2 remains `implementation_complete_external_validation_pending`.

## What was reconciled first

Checked against production rather than against documentation, as §1 requires.

| check | finding |
| --- | --- |
| `origin/main` | `8f304a8` |
| PR #471 | merged as `e2db136` |
| PR #472 | merged as `8f304a8` |
| production release | `8f304a8` — matches main exactly |
| `/health`, `/ready` | ok / ready |
| `UNIVERSAL_AGENT_ENABLED` | `shadow`, Deployed |
| `UNIVERSAL_AGENT_ALLOWLIST` | not set — nothing is enabled for anyone |
| Command 2 migrations | all ten tables live, RLS on all ten, zero client write grants |
| sandbox | no machines; app idle |

## Shadow evidence: zero observations, and why

§2 asks for the real shadow disagreements. There are none, and the reason is not a fault:
**no user build has run since the flag deployed.** Production logs contain no
`[universal-shadow]` lines and no build activity at all.

The shadow observer fires inside `runBuildPipeline`, so with no builds there is nothing to
observe. Rather than invent data, this records the honest state: the CRITICAL GATE in §2 —
"if any material case shows legacy was correct and universal was wrong" — has **zero cases
on either side**, so it is passed vacuously and not meaningfully. Shadow will produce
evidence as soon as real builds run; that evidence is still worth reading before any
enabled rollout.

## What this verification fixed

Reconciliation found that §5 could not be satisfied at all, for a reason the previous
completion document had recorded but which had not been closed: **nothing called
`executeUniversalRun`.** It and `productionAdapters` were defined and tested and invoked by
no production code path, so setting the flag to `enabled` and allowlisting a project would
have produced exactly the same behaviour as leaving it off.

That is now wired. `runBuildPipeline` calls `tryUniversalBuild` once, immediately after the
shadow observation. It returns `null` — changing nothing — unless the flag is `enabled`
*and* the project is allowlisted, so the legacy pipeline is untouched for every user.

The universal branch runs: routing → spec → architecture → security controls → acceptance →
implementation → sandbox validation → bounded repair → complete-diff review → commit.

§8 is satisfied structurally: `capabilityCandidates` converts the runtime model registry
into `ModelCapabilityProfile`s and `routeByCapability` selects, so the enabled path does not
fall through to `intelligentRouter`. The selected model, its fallbacks, the reason and every
exclusion are recorded on the outcome.

## The blocker

**`M19_NO_OWNER_CONTROLLED_TEST_PROJECT`**

§3 requires one owner-controlled or internal test project and forbids using a customer
project as an experiment. Queried against production:

- **6 projects exist. All belong to real users** (domains `gmail.com` and `aganseo.com`).
- **0 projects belong to the operator account** (`evanderthorne.help@gmail.com`).
- 3 GitHub integrations exist, all belonging to those users.

So there is no project that may be used, and creating one cannot be completed from here:

1. It needs an authenticated account for the operator, who currently owns no project.
2. §9 requires the final write to go through the Command 1 atomic GitHub path against a
   real connected repository. That needs a GitHub OAuth authorization, which only a person
   can complete — a token cannot be minted on someone's behalf.

Without a repository to write to, §6's required evidence (branch, commit SHA, resulting
diff), §9 entirely, and §10's follow-up modification cannot be produced. Running the build
anyway against a customer project would violate §3, and reporting a run that did not commit
as a success would be exactly the false evidence this command exists to prevent.

### A second gap, stated rather than hidden

The commit step is currently wired to `refusingCommit`. The universal path does not yet own
the repository shipping step, which is deeply integrated with the legacy flow's
`planGitHubShipping`. A live enabled run today would reach `commit` and fail loudly.

This is implementable, unlike the blocker above. It was not completed because without a test
project the result could not be verified, and wiring an unverifiable write path into the
production build pipeline is a worse outcome than a visible refusal.

## Exactly what unblocks M19

1. Designate or create an owner-controlled test project and connect GitHub to it. That
   single action is the only step requiring a human.
2. Wire the universal commit to the atomic GitHub path — implementable once there is a
   repository to verify against.
3. Set `UNIVERSAL_AGENT_ALLOWLIST=<that project id>` and `UNIVERSAL_AGENT_ENABLED=enabled`.
4. Run the Rust CLI request through the production entrypoint and capture §6's evidence.
5. Run the `--pretty` follow-up for §10.
6. Return production to `shadow`.

## Production state at the end of this verification

Unchanged and safe. `UNIVERSAL_AGENT_ENABLED` remains `shadow`; no allowlist was ever set;
nothing was enabled for any user. Production serves `8f304a8`, `/health` and `/ready` both
answer, and `xroga-sandbox` holds no machines.

No customer project was touched. No paid resource was created. No secret was printed.
