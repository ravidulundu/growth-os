# Branch Strategy and Commit Convention

## Branch Model

- `main`: production branch
- `develop`: staging/integration branch
- Feature/fix branches:
  - `feat/*`
  - `fix/*`
  - `chore/*`
  - `refactor/*`
  - `docs/*`

Examples:

- `feat/x-api-rate-limit-guard`
- `fix/magic-link-token-verification`

## Commit Convention

Conventional Commits are mandatory.

Allowed types:

- `feat`
- `fix`
- `chore`
- `refactor`
- `docs`
- `test`
- `ci`
- `perf`
- `build`
- `revert`

Examples:

- `feat(api): add scheduler retry strategy`
- `fix(auth): handle expired magic link token`
- `chore(ci): add quality gate step`
- `refactor(generation): split prompt composer`

## Enforcement

- Local hook:
  - `.husky/commit-msg` -> `pnpm commitlint --edit`
- Branch name validation:
  - `pnpm branch:check <branch-name>`
- CI PR guardrails:
  - branch name check
  - commit convention check
