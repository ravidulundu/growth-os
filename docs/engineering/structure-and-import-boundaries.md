# Strict Project Structure and Import Boundaries

## Target Monorepo Layout

```text
.
├─ apps/
│  ├─ web/                 # Next.js
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ lib/
│  │  └─ tests/
│  ├─ api/                 # NestJS
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ x_integration/
│  │  │  │  ├─ style/
│  │  │  │  ├─ generation/
│  │  │  │  ├─ content_library/
│  │  │  │  ├─ scheduling/
│  │  │  │  ├─ analytics/
│  │  │  │  ├─ billing/     # MVP-1
│  │  │  │  └─ audit/       # MVP-1
│  │  │  ├─ shared/
│  │  │  └─ main.ts
│  │  └─ tests/
│  └─ worker/              # BullMQ worker
├─ packages/
│  ├─ db/                  # migrations/schema
│  ├─ ui/                  # shared components/helpers
│  └─ config/              # shared eslint/tsconfig
├─ docs/
│  ├─ architecture/
│  ├─ engineering/
│  └─ runbooks/
└─ .github/workflows/
```

## Import Boundaries

1. Cross-app imports are forbidden.

- `apps/web` cannot import from `apps/api` or `apps/worker` sources.
- `apps/api` cannot import from `apps/web` or `apps/worker` sources.

2. Shared code goes only through `packages/*`.

- Shared helpers/types belong to `packages/shared` or `packages/ui`.

3. `packages/shared` and `packages/ui` must stay app-agnostic.

- They cannot import from `apps/*`.

4. Build artifact imports are forbidden.

- No imports from `dist/*` or `.next/*`.

## Enforcement

- ESLint `no-restricted-imports` rules are defined in:
  - `eslint.config.mjs`
- Violations fail CI (`pnpm quality:gate`).
