# Engineering Rules

Bu klasör Faz 4 kapsamında ürünleşme ve ekip ölçeklenmesi için zorunlu mühendislik kurallarını içerir.

## Documents

- `docs/engineering/structure-and-import-boundaries.md`
- `docs/engineering/branching-and-commits.md`
- `docs/engineering/pr-checklist-and-test-policy.md`
- `docs/engineering/versioning-and-release-notes.md`
- `docs/engineering/test-strategy-and-quality-gates.md`
- `docs/engineering/ci-cd-pipeline.md`

## Enforcement

- CI quality gate: `pnpm quality:gate`
- CI/CD workflow: `.github/workflows/ci.yml`
- Security workflow: `.github/workflows/security.yml`
- Branch naming check: `pnpm branch:check`
- Commit convention check: `pnpm commitlint`
- Release note automation: `.github/workflows/release-please.yml`
