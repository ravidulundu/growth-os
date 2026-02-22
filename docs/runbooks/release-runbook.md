# Release Runbook

1. Confirm `pnpm quality:gate` passes.
2. Prepare release notes from changelog.
3. Create release branch `release/<version>`.
4. Tag release `v<version>`.
5. Verify deploy and rollback plan.
