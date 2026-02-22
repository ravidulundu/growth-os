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
- `pnpm test:unit`: unit testler
- `pnpm test:integration`: integration testler
- `pnpm coverage:api`: API coverage gate (%70+)
- `pnpm quality:gate`: lint + typecheck + unit + integration + coverage + build
- `pnpm deploy:staging`: staging deploy hook tetikler
- `pnpm deploy:prod`: prod deploy hook tetikler
- `pnpm smoke:test`: healthcheck + basic auth flow smoke testi

## MVP-0 API Akışı (Local)

1. `POST /x/connect/start` -> OAuth2 PKCE start
2. `POST /x/connect/callback` -> X account + encrypted token kaydı
3. `POST /x/timeline/ingest` -> timeline postlarını DB'ye al
4. `POST /style/extract` -> style_profile üret
5. `POST /generation/draft` -> draft + v1 oluştur
6. `POST /scheduling/schedule` (veya `/publish-now`) -> publish job enqueue
7. Worker publish eder, `post_metric_snapshots` (`t15`, `t60`, `t24`) yazar
8. `GET /analytics/content/:workspaceId/:contentId` ile metrics gör

## Optional MailHog

Mail testi için MailHog'u profile ile ayağa kaldır:

- `docker compose --profile mailhog up -d`

## CI

- `.github/workflows/ci.yml`: lint -> typecheck -> unit -> integration -> build -> deploy
- `.github/workflows/security.yml`: CodeQL + opsiyonel Snyk
- Staging deploy: `develop` push (hook + smoke)
- Prod deploy: `v0.x.y` tag (main üstünde doğrulama + smoke)
- Manual approval: GitHub `production` environment required reviewers ile

## Engineering Rules

- Engineering docs index: `docs/engineering/README.md`
- Test strategy: `docs/engineering/test-strategy-and-quality-gates.md`
- CI/CD pipeline: `docs/engineering/ci-cd-pipeline.md`
- Branch check (local): `pnpm branch:check feat/my-change`
- Commit convention check (local): `pnpm commitlint`
- Full quality gate (local): `pnpm quality:gate`

## Faz Dokumanlari

- `docs/faz-1-discovery-kapsam.md`
- `docs/faz-2-mimari-stack.md`
- `docs/faz-3-setup.md`
- `docs/faz-4-proje-kurallari.md`
- `docs/faz-5-gelistirme-test.md`
