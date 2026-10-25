# Development storage hygiene (permanent rule for every Xroga task)

The founder's laptop has a finite drive. Disposable files from builds, tests and Docker must not accumulate there. Every task, by Claude Code or Codex, follows:

**Create -> Execute -> Verify -> Clean up -> Report**

## Rules
1. **Check free space before and after** any storage-heavy step (installs, image builds, large test data, browser downloads). `node scripts/dev/task-cleanup.mjs begin <task-id>` records the starting free space and stops the task with exit code 3 below 15 GB free.
2. **Put disposable output in the task's scratch directory**, `.task-scratch/<task-id>/` (gitignored, exported as `XROGA_TASK_SCRATCH`): test datasets, screenshots, temporary logs, generated artifacts, downloaded fixtures.
3. **Label what Docker creates** for the task: `--label xroga.task=<task-id>`. The browser host already labels its containers and networks `xroga.browser-job=1`.
4. **Always clean up, success or failure.** Wrap the work: `node scripts/dev/task-cleanup.mjs run <task-id> [--image xroga-...:tag] [--browser-jobs] -- <command>`. It cleans after the command whatever its exit code, and on Ctrl+C or termination.
5. **Report what each cleanup actually recovered.** The tool prints free space before and after; quote those numbers, not estimates.
6. **Keep large evidence only as small, committed, redacted receipts.** Raw 10 to 40 GB test files never stay on the laptop; delete them as soon as the receipt is verified.

## What the tool removes, and nothing else
- the task's own scratch directory (never followed through a link, never outside `.task-scratch`);
- containers and networks labelled `xroga.task=<task-id>` (and with `--browser-jobs`, `xroga.browser-job=1`);
- Docker images named explicitly with `--image`, and only exact tags that start with `xroga-` (`docker rmi <tag>`, never a prune).

## What nobody may delete without the founder's explicit approval
Source code, Git history and uncommitted changes, credentials and key files, production evidence and recovery files, Docker volumes, WSL distributions and their virtual disks (`ext4.vhdx`, `docker_data.vhdx`), the Theta trading-bot data, other tasks' scratch directories or worktrees, and shared caches (npm, Playwright, uv, `.cache`). Never run `docker system prune`, `docker volume prune`, `docker builder prune` or a wildcard delete as cleanup. Removing a Docker image does not shrink the Docker disk file on Windows; compacting it is a separate, approved step.

## Coordination with Codex
Before removing a shared Docker image or worktree, check that no other task is using it (`docker ps`, `git worktree list`, the other task's scratch directory). A task cleans only what carries its own task id.

## Reference
`scripts/dev/task-cleanup.mjs` (tool), `scripts/dev/task-cleanup.test.mjs` (safety tests: id and path containment, link refusal, `xroga-` image allow-list, cleanup after failure, low-space stop).
