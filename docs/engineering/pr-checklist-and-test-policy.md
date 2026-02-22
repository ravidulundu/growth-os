# PR Checklist and Minimum Test Policy

## Review Process

- Minimum 1 review required.
- Solo mode fallback: self-review checklist + small, single-purpose PR.
- PRs must stay focused and small.

## PR Checklist (minimum)

- Lint/format pass
- Unit test added or updated
- If migration exists, rollback note included
- Observability updated (log + error path)
- Security impact reviewed (workspace isolation, especially MVP-1)

PR template:

- `.github/pull_request_template.md`

## Minimum Test Requirements

1. New module => at least 1 unit test.
2. X API integration changes => integration test with mock/stub.

## CI Quality Gates

Blocking steps:

1. Branch name check (PR)
2. Commit convention check (PR)
3. `pnpm quality:gate`

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

TypeScript strictness:

- `strict: true`
- `noImplicitAny: true`
