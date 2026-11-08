# Chrome pairing source amendment

The approved release package is preserved at [a0b5393a](https://github.com/Xroga/xroga.com/blob/a0b5393a0a5b29a7ea1deea580e954b42fe4700e/docs/operations/local-browser-pairing-20261108/RELEASE.md). This amendment changes only its exact candidate identifiers. Application code, dependency lockfiles, build workflows, project configuration, acceptance scope, rollback and cumulative spending ceilings are identical to the original approved pair.

| Candidate | Approved source | Amended source | Verified difference |
| --- | --- | --- | --- |
| API and canonical Job | `af9fea61d05720051d748ca0f134bee002d7a65b` | `92ec31a3369a0d8ca42d23d62f79d8f522b5fb9e` | Four generated runtime inventory files. The inventory now binds the exact checked-in tenant-security workflow hash. |
| Workspace | `bf63f4cfbb8f4c4a4688f53bb3f141c940d53b18` | `da483f922a0b28e0405446425860f821f84e11df` | The same four generated files and two tests that verify the already-live sidebar. The tests require the accessible Projects navigation button and confirm billing remains in the account menu without duplicating the compact upgrade button. |

All 14 focused sidebar tests passed. Runtime inventory, source and evidence checks passed locally on both. The shared Windows dependency installation lacks the reviewed postinstall patches, so its dependency-patch fixture results are not a release receipt. Required clean Linux CI runs on the exact candidates.

- API [Docker build](https://github.com/Xroga/xroga.com/actions/runs/42472931644), [unit and baseline](https://github.com/Xroga/xroga.com/actions/runs/42472934665), [tenant security](https://github.com/Xroga/xroga.com/actions/runs/42472937268)
- Workspace [build](https://github.com/Xroga/xroga.com/actions/runs/42472931680), [unit and baseline](https://github.com/Xroga/xroga.com/actions/runs/42472934497), [tenant security](https://github.com/Xroga/xroga.com/actions/runs/42472937170)

Use the four guarded SQL files from the immutable commit containing this amendment. Only the new-source value changes in `02-open-pairing.sql` and `03-pause-pairing.sql`. The rollback pair is still API/Job `1715953a` and Vercel `ed184815`. Verified signed-in Workspace account and Vercel project access are ready. Recheck the installed extension ID and a fresh recovery point. All original CI and authenticated candidate requirements still apply.

The original single 60-minute maintenance window remains unused. Ceilings remain $0.50 one-time Google usage, $0.10/month for image retention and one read-only browser task capped at $0.036 from the existing model balance. No production SQL, cloud build submission, paid model request or traffic change has occurred.
