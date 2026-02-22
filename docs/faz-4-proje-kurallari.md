# Faz 4 - Proje Kuralları (Strict)

## Amaç ve Kapsam

- Kod kalitesini ve ekip büyümesini destekleyen kuralları baştan enforce etmek
- Ürünleşme için branch/release disiplinini netleştirmek

## Teslimatlar

### 1) Strict klasör yapısı + import boundaries

- Doküman: `docs/engineering/structure-and-import-boundaries.md`
- Yapı güncellemeleri:
  - `apps/web/{components,lib,tests}`
  - `apps/api/src/modules/*`
  - `apps/api/src/shared/*`
  - `apps/api/tests`
  - `packages/{db,ui,config}`
  - `docs/{architecture,engineering,runbooks}`
- Enforcement: `eslint.config.mjs` no-restricted-imports

### 2) Branch stratejisi + commit convention

- Doküman: `docs/engineering/branching-and-commits.md`
- Strategy:
  - `main` (prod), `develop` (staging)
  - feature/fix branches: `feat/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*`
- Enforcement:
  - `scripts/check-branch-name.mjs`
  - `commitlint.config.cjs`
  - `.husky/commit-msg`
  - CI `guardrails` job

### 3) PR checklist + minimum test şartı

- Doküman: `docs/engineering/pr-checklist-and-test-policy.md`
- PR template: `.github/pull_request_template.md`
- Policy:
  - Yeni modül -> en az 1 unit test
  - X integration değişikliği -> mock/stub integration test

### 4) Versiyonlama + release notes standardı

- Doküman: `docs/engineering/versioning-and-release-notes.md`
- Changelog: `CHANGELOG.md`
- Otomasyon:
  - `.github/workflows/release-please.yml`
  - `release-please-config.json`
  - `.release-please-manifest.json`

### 5) CI Quality Gates

- Workflow: `.github/workflows/ci.yml`
- `guardrails` (PR):
  - branch name check
  - commit convention check
- `validate`:
  - `pnpm quality:gate`
  - kapsam: format + lint + typecheck + test + build

## Milestone (Gün 2-3)

- Kurallar `/docs/engineering/*` altında yazılı hale geldi.
- CI quality gates blocking olarak tanımlandı.

## Risk ve Bağımlılık

- Risk: Kural setinin uygulanmaması -> CI guardrails ile azaltıldı.
- Bağımlılık: Faz 5 test altyapısı ile minimum test şartı daha katı hale getirilecek.
