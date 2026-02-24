# Review Guidelines — Growth-OS

## Critical Areas

These files and patterns require extra scrutiny on every PR:

- **Auth & workspace isolation** (`apps/api/src/shared/auth/session-auth.guard.ts`, `cookie-policy.ts`, `public.decorator.ts`): Any change to session validation, workspace scoping, or scoped resource lookup must be reviewed for privilege escalation and cross-workspace data leaks. Verify that all new endpoints are covered by SessionAuthGuard (global APP_GUARD) and that @Public() is only used intentionally.
- **Database migrations** (`packages/db/migrations/`): Every new migration must be additive and backwards-compatible. Verify: no DROP without explicit rollback plan, no ALTER that breaks running API instances during rolling deploy, naming follows `NNN_description.sql` convention.
- **Worker publish pipeline** (`apps/worker/src/main.ts`): Changes to `processPublishJob`, retry logic, or similarity guard affect production content publishing. Verify idempotency, graceful shutdown preservation, and that DB state transitions match the state machine in `packages/shared/src/scheduling/state-machine.ts`.
- **Billing & usage metering** (`apps/api/src/modules/billing/`): Any change to metering, limit enforcement, or plan logic must be reviewed for correctness. Off-by-one errors here mean free usage or false blocks.
- **X (Twitter) OAuth & API calls** (`apps/api/src/modules/x_integration/`, `apps/worker/src/main.ts`): Token handling, PKCE flow, and rate limit classification. Verify no token leaks in logs, proper error classification (transient vs permanent), and that mock mode (`X_CLIENT_MODE=mock`) doesn't leak into production paths.
- **Shared security primitives** (`packages/shared/src/security/token-vault.ts`): Encryption, hashing, and secret handling. Any change needs careful review for timing attacks, key rotation support, and proper IV/nonce usage.

## Conventions

Enforce these project standards on all PRs:

- **ESLint complexity rules are CI-enforced.** No PR may introduce or increase violations of: `max-lines-per-function: 80`, `max-depth: 4`, `complexity: 15`, `max-params: 4`, `max-nested-callbacks: 3`. If a function exceeds limits, it must be decomposed.
- **No spagetti code.** Every function does one thing. 80+ line functions must be split. 4+ nesting depth requires early return or extract function. 4+ parameters requires options object pattern.
- **Dead code is forbidden.** No commented-out code, no unused imports, no unused variables. Delete, don't comment.
- **Magic numbers/strings are forbidden.** All constants must have descriptive names.
- **Conventional Commits required.** All commit messages follow `type(scope): description` format. Enforced by commitlint.
- **Branch naming convention.** Must follow `feat/*`, `fix/*`, `chore/*`, `refactor/*`, `test/*`, `docs/*` pattern.
- **Zod validation at API boundaries.** All controller inputs must be validated with Zod schemas before reaching service layer. No raw `req.body` access in services.
- **No `any` type.** `@typescript-eslint/no-explicit-any` is set to error. Use proper types or `unknown` with type guards.
- **No `console.log`.** `no-console` rule is error-level. Use the shared `createLogger(scope)` from `@growth-os/shared`.
- **Import boundaries enforced.** No cross-app imports (`apps/web` cannot import from `apps/api`). Shared code goes in `packages/*`. No importing from `dist/` directories.
- **Test with every feature/fix.** New features require unit tests in the same PR. Bug fixes require a regression test first, then the fix. No "we'll add tests later".
- **Test naming follows Given/When/Then.** Test names must clearly describe the scenario. Each test verifies one behavior.

## Ignore

Skip these files and directories during review — they are auto-generated or not reviewable:

- `pnpm-lock.yaml`
- `**/dist/**`
- `**/.next/**`
- `**/.turbo/**`
- `**/coverage/**`
- `**/node_modules/**`
- `**/*.tsbuildinfo`
- `**/playwright-report/**`
- `**/test-results/**`
- `.pnpm-store/**`

## Performance

Flag these patterns as potential performance issues:

- **Database queries inside loops.** All DB access must be batched or use a single query with `IN` / `ANY` clauses. The `pg` driver is used directly (no ORM) — N+1 queries are easy to introduce accidentally.
- **Missing pool limits.** `apps/api/src/shared/db/pool.ts` pool configuration must include `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, and `statement_timeout`. Missing limits risk DB connection exhaustion under load.
- **Unbounded result sets.** Every `SELECT` query that could return many rows must have a `LIMIT` clause or pagination. Flag any query without `LIMIT` that isn't aggregating.
- **Blocking operations in worker.** `apps/worker/src/main.ts` runs async job processing. Synchronous/blocking calls (e.g., `fs.readFileSync`, CPU-heavy loops) block the event loop and delay all queued jobs.
- **Missing Redis connection cleanup.** BullMQ queues and workers hold Redis connections. Verify that any new Queue/Worker instance is properly closed in the graceful shutdown handler (`SIGINT`/`SIGTERM`).
- **Large React component renders.** `apps/web/components/studio/` contains complex views. New components should avoid inline object/function creation in JSX props (causes unnecessary re-renders). Use `useMemo`/`useCallback` for expensive computations passed as props.
- **Turbo cache invalidation.** Changes to environment variables that affect build output must be reflected in `turbo.json` `env` or `globalEnv` arrays. Missing entries cause stale cache hits.
