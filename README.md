# Growth OS Monorepo

## Monorepo Structure

- `apps/web`: Next.js (App Router) frontend
- `apps/api`: NestJS (Fastify adapter) API
- `apps/worker`: BullMQ background worker
- `packages/shared`: shared types/constants
- `packages/db`: migrations/schema
- `packages/ui`: shared UI/helpers
- `packages/config`: shared config defaults
- `packages/db/migrations`: SQL migrations
- `docs/architecture`, `docs/engineering`, `docs/runbooks`

## Setup (Detay)

1. `cp .env.example .env`
2. `cp .env.local.example .env.local` (opsiyonel, local secret override)
3. `pnpm i`
4. `pnpm dev:prepare` (db:up + migrate + seed)
5. `pnpm dev` (web + api)
6. Ayrı terminalde: `pnpm worker:dev`

## Local URLs

- Web: `http://localhost:3000`
- API Health: `http://localhost:4000/health`
- MailHog UI (opsiyonel): `http://localhost:8025`

Not: `3000` doluysa `WEB_PORT=3010 pnpm dev` ile web portunu override edebilirsin.

## Commands

- `pnpm dev`: web + api paralel
- `pnpm worker:dev`: background worker hot reload
- `pnpm db:up`: postgres + redis (compose)
- `pnpm db:down`: local infra kapat
- `pnpm db:migrate`: migration uygula
- `pnpm seed`: demo data seed
- `pnpm dev:prepare`: db + migration + seed otomasyonu
- `pnpm lint`: ESLint
- `pnpm format`: Prettier write
- `pnpm format:check`: Prettier check

## Optional MailHog

Mail testi için MailHog'u profile ile ayağa kaldır:

- `docker compose --profile mailhog up -d`

## CI

`.github/workflows/ci.yml`

- guardrails (PR): branch name + commit convention
- validate: `pnpm quality:gate` (format:check + lint + typecheck + test + build)

## Engineering Rules

- Engineering docs index: `docs/engineering/README.md`
- Branch check (local): `pnpm branch:check feat/my-change`
- Commit convention check (local): `pnpm commitlint`
- Full quality gate (local): `pnpm quality:gate`
