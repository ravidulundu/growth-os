# Faz 3 - Setup (Detay)

## Amaç ve Kapsam

- Repo iskeletini, local dev ortamını ve ilk çalıştırmayı standardize etmek
- Çalışır iskelet: hello world + DB migrate + basic auth (magic link stub)
- DX standardı: lint/format/pre-commit ve net script isimleri

## Teslimatlar

### Monorepo

- `apps/web` (Next.js)
- `apps/api` (NestJS + Fastify)
- `apps/worker` (BullMQ background worker)
- `packages/shared`

### Repo setup script standardı

- `pnpm i`
- `pnpm dev` -> web + api paralel
- `pnpm db:up` -> postgres + redis
- `pnpm db:migrate` -> schema kurulumu
- `pnpm seed` -> demo data
- `pnpm dev:prepare` -> db:up + db:migrate + seed otomasyonu
- `pnpm worker:dev` -> background worker

### Environment yönetimi

- `.env.example` (açıklamalı tüm değişkenler)
- `.env.local.example` (local secret override referansı)
- `.env.staging.example` / `.env.production.example` (referans)
- Gerçek staging/prod secret'ları yalnızca secret manager'da

### Docker / Compose

- `postgres`
- `redis`
- opsiyonel `mailhog` (`docker compose --profile mailhog up -d`)

### İlk endpointler

- `GET /health`
- `POST /auth/magic-link/request`
- `POST /auth/magic-link/verify`

### Migration + seed

- `packages/db/migrations/001_init.sql`
- `apps/api/src/shared/db/migrate.ts`
- `apps/api/src/shared/db/seed.ts`

### DX

- Lint: ESLint
- Format: Prettier
- Pre-commit: Husky + lint-staged
- Task runner: Turbo

## Doğrulama Sonuçları

Başarılı çalıştırılan komutlar:

- `pnpm i`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm build`
- `pnpm db:up`
- `pnpm db:migrate`
- `pnpm seed`

HTTP doğrulama:

- `GET /health` -> `{"status":"ok"...}`
- `POST /auth/magic-link/request` -> magic link döndü
- `POST /auth/magic-link/verify` -> `ok:true` + `sessionToken`

## Not

- Bu hostta port çakışması nedeniyle local default portlar `55432` (Postgres) ve `56379` (Redis).
