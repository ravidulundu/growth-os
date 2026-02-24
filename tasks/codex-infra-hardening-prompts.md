# Codex Prompts — Altyapı Sağlamlaştırma (6 Aksiyon)

> Öncelik sırasına göre. Her prompt bağımsız.
> Tech stack: NestJS 11 + Fastify 5 + PostgreSQL 16 (pg driver) + BullMQ 5 + Redis 7 + pnpm monorepo + Turbo

---

## 🔴 1. Global API Rate Limiting

```
Proje: NestJS 11 + Fastify 5 monorepo (apps/api)
Sorun: Hiçbir API endpoint'inde rate limiting yok. Generation endpoint'leri LLM çağırıyor (maliyetli), scheduling publish tetikliyor, X integration OAuth token exchange yapıyor. Hepsi abuse'a tamamen açık.

Mevcut durum:
- apps/api/src/main.ts: Sadece CORS middleware var (satır 49-60)
- apps/api/src/app.module.ts: SessionAuthGuard global APP_GUARD olarak kayıtlı (satır 34-37). Başka guard yok.
- 9 controller var, hiçbirinde throttle decorator yok
- package.json'da @nestjs/throttler yok

Yapılacaklar:

1. @nestjs/throttler paketini kur:
   cd apps/api && pnpm add @nestjs/throttler

2. apps/api/src/app.module.ts'e ThrottlerModule ekle:
   - ThrottlerModule.forRoot ile global config:
     - default: { ttl: 60_000, limit: 60 } (dakikada 60 istek)
   - ThrottlerGuard'ı APP_GUARD olarak ekle (SessionAuthGuard'dan ÖNCE)
   - Fastify adapter kullanıldığı için ThrottlerModule'ün Fastify desteğini kontrol et

3. Endpoint-seviye override'lar (decorator ile):
   - apps/api/src/modules/generation/generation.controller.ts:
     - POST /generation/draft → @Throttle({ default: { ttl: 60_000, limit: 10 } })  (dakikada 10 — LLM maliyetli)
     - POST /generation/content/:contentId/version → @Throttle({ default: { ttl: 60_000, limit: 10 } })
   - apps/api/src/modules/scheduling/scheduling.controller.ts:
     - POST /scheduling/schedule → @Throttle({ default: { ttl: 60_000, limit: 20 } })
     - POST /scheduling/publish-now → @Throttle({ default: { ttl: 60_000, limit: 10 } })
   - apps/api/src/modules/x_integration/x-integration.controller.ts:
     - POST /x/connect/start → @Throttle({ default: { ttl: 60_000, limit: 5 } })  (OAuth flow, çok nadir)
     - POST /x/connect/callback → @Throttle({ default: { ttl: 60_000, limit: 5 } })
   - apps/api/src/modules/auth/auth.controller.ts:
     - Magic link endpoint'leri zaten Better Auth tarafında rate limited ama ek NestJS katmanı ekle:
     - @Throttle({ default: { ttl: 60_000, limit: 5 } })

4. @SkipThrottle() decorator:
   - Health check controller'a ekle (varsa)
   - GET endpoint'lerine genel olarak daha yüksek limit ver veya skip et

5. Fastify uyumu:
   - NestJS ThrottlerGuard Fastify'da IP'yi req.ip yerine req.raw.socket.remoteAddress'ten alabilir.
   - Gerekirse custom ThrottlerGuard extend et ve getTracker() override et.

Kısıtlar:
- Mevcut SessionAuthGuard davranışını değiştirme
- Controller signature'larını değiştirme
- Test dosyalarına dokunma (throttle testleri ayrı PR)

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit
```

---

## 🔴 2. API PostgreSQL Pool Hardening

```
Proje: NestJS 11 API app (apps/api), pg driver (ORM yok)
Sorun: API'nin DB pool'u sadece connectionString ile oluşturulmuş — max, idleTimeout, connectionTimeout, statement_timeout yok. Yük altında PG'yi boğar veya uzun query'ler bağlantı tutar.

Mevcut dosya — apps/api/src/shared/db/pool.ts (24 satır):
  - Singleton pattern, getPool() ile lazy init
  - Sadece: new Pool({ connectionString })
  - closePool() mevcut

Worker'daki iyi örnek — apps/worker/src/main.ts (satır 63-68):
  - max: envInt("PG_POOL_MAX", 12)
  - idleTimeoutMillis: envInt("PG_POOL_IDLE_TIMEOUT_MS", 30_000)
  - connectionTimeoutMillis: envInt("PG_POOL_CONNECTION_TIMEOUT_MS", 10_000)

Yapılacaklar:

1. apps/api/src/shared/db/pool.ts'i güncelle:
   - Pool oluşturmaya şu parametreleri ekle:
     max: parseInt(process.env.PG_POOL_MAX ?? "20", 10),
     idleTimeoutMillis: parseInt(process.env.PG_POOL_IDLE_TIMEOUT_MS ?? "30000", 10),
     connectionTimeoutMillis: parseInt(process.env.PG_POOL_CONNECTION_TIMEOUT_MS ?? "10000", 10),
     statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS ?? "30000", 10),
   - API default max=20 (worker'dan yüksek çünkü daha çok concurrent request alır)
   - statement_timeout=30s (30 saniyeden uzun query killenir)

2. .env.example dosyasına (varsa, yoksa oluşturma) bu env'leri dokümante et:
   Sadece yorum satırı olarak ekle, default değerleri göster.

3. Mevcut getPool() singleton pattern'ini koru, sadece Pool constructor options'ı genişlet.

Kısıtlar:
- closePool() fonksiyonuna dokunma
- Pool'un singleton yapısını değiştirme
- Başka dosyalardaki pool kullanımlarını değiştirme

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration
```

---

## 🔴 3. Migration Checksum Koruması

```
Proje: Custom SQL migration runner (apps/api/src/shared/db/migrate.ts)
Sorun: schema_migrations tablosunda sadece file_name var, checksum yok. Bir migration dosyası prod'a uygulandıktan sonra değiştirilirse, bu değişiklik sessizce fark edilmez — veri tutarsızlığı riski.

Mevcut migration tablosu (migrate.ts satır 10-19):
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )

Mevcut migration flow (migrate.ts satır 27-46):
  - BEGIN → SQL execute → INSERT file_name → COMMIT
  - Hata durumunda ROLLBACK

Migration dosyaları: packages/db/migrations/ (8 adet, 001_ ile 008_ arası)

Yapılacaklar:

1. schema_migrations tablosuna checksum kolonu ekle:
   - Yeni migration dosyası oluştur: packages/db/migrations/009_add_migration_checksum.sql
   - İçeriği:
     ALTER TABLE schema_migrations
       ADD COLUMN IF NOT EXISTS checksum TEXT;
   - Mevcut satırlar NULL kalır (geriye uyumlu)

2. apps/api/src/shared/db/migrate.ts güncelle:
   a. Node.js crypto ile SHA-256 hash hesapla:
      import { createHash } from "node:crypto";
      function fileChecksum(content: string): string {
        return createHash("sha256").update(content).digest("hex");
      }

   b. ensureMigrationsTable() — checksum kolonu ekle (IF NOT EXISTS):
      Mevcut CREATE TABLE'dan sonra ALTER TABLE ekle

   c. appliedFiles() — checksum bilgisini de çek:
      SELECT file_name, checksum FROM schema_migrations;

   d. applyMigration() — INSERT'e checksum ekle:
      INSERT INTO schema_migrations (file_name, checksum) VALUES ($1, $2)

   e. main() akışına checksum doğrulama ekle:
      - Zaten uygulanmış her migration için:
        - Dosya hala mevcutsa, checksum'ı karşılaştır
        - Uyuşmazlık varsa: HATA fırlat ve dur (migration'ları çalıştırma)
        - Mesaj: "Checksum mismatch for ${fileName}: expected ${stored}, got ${computed}. Migration file was modified after application."
      - Checksum null ise (eski migration'lar): uyarı ver ama devam et
        - Opsiyonel: ilk çalıştırmada mevcut migration'ların checksum'ını backfill et

Kısıtlar:
- Mevcut 8 migration dosyasını değiştirme
- Migration runner'ın transactional yapısını bozma
- Geriye uyumlu ol: checksum null olan eski kayıtlar hata vermemeli

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm db:up && pnpm db:migrate  (yeni migration'ı uygula)
  pnpm db:migrate  (tekrar çalıştır — idempotent olmalı, 0 yeni migration)
  # Bir migration dosyasını kasıtlı değiştirip tekrar çalıştır → hata beklenir
```

---

## 🟡 4. Turbo Cache — NODE_ENV Ekleme

```
Proje: Turbo 2.3 monorepo (turbo.json)
Sorun: turbo.json'daki hiçbir task'ta NODE_ENV env tanımlı değil. Build ve test çıktıları NODE_ENV'e göre farklılık gösterebilir (conditional imports, debug logs, vb.) ama Turbo aynı cache'i kullanır.

Mevcut turbo.json:
{
  "tasks": {
    "dev": { "cache": false, "persistent": true, "env": ["WEB_PORT", "API_PORT", "APP_URL", "NEXT_PUBLIC_API_URL"] },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": { "dependsOn": ["^typecheck"], "outputs": [] },
    "test": { "dependsOn": ["^test"], "outputs": [] }
  }
}

Yapılacaklar:

1. turbo.json'a globalEnv ekle (root seviyede, tasks'ın üstünde):
   "globalEnv": ["NODE_ENV"]

   Bu tüm task'ları etkiler — NODE_ENV değişince tüm cache invalidate olur.

2. build task'ına env ekle (Next.js NEXT_PUBLIC_* env'leri build output'u etkiler):
   "build": {
     "dependsOn": ["^build"],
     "outputs": ["dist/**", ".next/**"],
     "env": ["NEXT_PUBLIC_*"]
   }

Kısıtlar:
- Mevcut task pipeline'ı (dependsOn) değiştirme
- Yeni task ekleme
- dev task'ındaki env'leri değiştirme

Doğrulama:
  turbo run build --dry  (cache key'de NODE_ENV ve NEXT_PUBLIC_* göründüğünü doğrula)
```

---

## 🟡 5. Request Correlation ID

```
Proje: NestJS 11 + Fastify 5 API (apps/api), shared logger (packages/shared)
Sorun: API request'lerinde correlation/request ID yok. Distributed debug'da hangi log hangi request'e ait belli değil.

Mevcut logger — packages/shared/src/observability/logger.ts:
  - createLogger(scope) → { info, warn, error }
  - Her log JSON: { timestamp, level, scope, message, metadata?, error? }
  - Metadata arbitrary key-value kabul eder

Mevcut API bootstrap — apps/api/src/main.ts:
  - Fastify adapter (satır 33-35)
  - CORS middleware (satır 49-60)
  - Başka middleware yok

Yapılacaklar:

1. Fastify hook ile request ID enjekte et (apps/api/src/main.ts):
   - Fastify'ın built-in request ID desteğini kullan:
     fastifyInstance.addHook("onRequest", async (request) => {
       request.requestId = request.headers["x-request-id"] ?? request.id;
     });
   - Fastify zaten her request'e unique id verir (request.id).
   - Client "x-request-id" header gönderirse onu kullan (distributed tracing).

2. NestJS request scope'unda requestId'yi erişilebilir yap:
   - AsyncLocalStorage kullan (Node.js native, ek paket gerektirmez):
     a. Yeni dosya: apps/api/src/shared/context/request-context.ts
        - AsyncLocalStorage<{ requestId: string }> instance export et
        - getRequestId() helper: store.getStore()?.requestId ?? "unknown"
     b. apps/api/src/main.ts'e Fastify hook ekle:
        - onRequest hook'unda asyncLocalStorage.run({ requestId }, done) çağır

3. Logger'ı requestId-aware yap:
   - packages/shared/src/observability/logger.ts'e dokunma (shared paket, bağımsız kalmalı)
   - Bunun yerine apps/api/src/shared/context/request-context.ts'den getRequestId() kullan
   - Controller/service seviyesinde loglara metadata olarak ekle:
     logger.info("draft created", { requestId: getRequestId(), contentId })

4. Response header'a requestId ekle:
   - Fastify onSend hook:
     reply.header("x-request-id", requestId)
   - Client debug için faydalı

Kısıtlar:
- packages/shared/src/observability/logger.ts'i değiştirme (shared paket, tüm app'ler kullanıyor)
- Mevcut controller/service kodlarına toplu değişiklik yapma (sadece altyapıyı kur)
- Worker'a dokunma (worker'da job ID zaten var)

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/api test:unit
  # Manuel: curl -v http://localhost:4000/health → response header'da x-request-id göründüğünü doğrula
```

---

## 🟡 6. BullMQ Queue-Level Job Config

```
Proje: BullMQ 5 queue producer (apps/api) + worker (apps/worker)
Sorun: Queue producer'da job eklerken attempts/backoff tanımlanmamış. Retry logic tamamen worker'da custom (processPublishJob içinde). Queue-level config olursa BullMQ native retry'ı da devreye girer — daha güvenilir.

Mevcut producer — apps/api/src/modules/scheduling/queue.ts:
  - getPublishQueue() ve getMetricsQueue() — sade Queue init, job options yok

Mevcut job ekleme — apps/api/src/modules/scheduling/scheduling.service.ts (satır 144-153):
  - queue.add("publish", { publishJobId }, { removeOnComplete: true, removeOnFail: 100, delay })
  - attempts ve backoff YOK

Mevcut worker retry — apps/worker/src/main.ts:
  - Custom calculateBackoffDelayMs() (exponential)
  - publish_jobs tablosunda attempt sayısı takibi
  - Max attempts: 3 (hard-coded)

Yapılacaklar:

1. apps/api/src/modules/scheduling/queue.ts'e defaultJobOptions ekle:
   - Queue constructor'a:
     new Queue("publish-jobs", {
       connection: connection(),
       defaultJobOptions: {
         attempts: 3,
         backoff: { type: "exponential", delay: 60_000 },
         removeOnComplete: true,
         removeOnFail: 100
       }
     })
   - metrics queue için:
     new Queue("metrics-jobs", {
       connection: connection(),
       defaultJobOptions: {
         attempts: 2,
         backoff: { type: "exponential", delay: 30_000 },
         removeOnComplete: true,
         removeOnFail: 50
       }
     })

2. scheduling.service.ts'deki job.add() çağrılarından removeOnComplete/removeOnFail'i kaldır:
   - Artık defaultJobOptions'tan gelecek
   - Sadece delay parametresi kalmalı

3. Worker'daki custom retry logic ile çakışma kontrolü:
   - BullMQ native retry VE custom retry logic birlikte çalışmamalı
   - apps/worker/src/main.ts'deki Worker constructor'a autorun: true bırak
   - Worker'daki processPublishJob fonksiyonunda, eğer BullMQ zaten retry ediyorsa custom retry'ı skip etmeli
   - Bunu anlamak için: job.attemptsMade property'sini kontrol et
   - ÖNEMLİ: Eğer custom retry logic BullMQ retry'dan daha sofistike ise (DB state update vb.), o zaman BullMQ attempts'i 1 yap ve custom retry'ı koru. İkisini karıştırma.

Kısıtlar:
- Worker'daki custom retry logic'i silme (DB state update yapıyor, BullMQ native retry bunu bilmez)
- İki retry mekanizmasının çakışmamasını garanti et
- Mevcut job data yapısını değiştirme

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/worker test
  pnpm --filter @growth-os/api test:unit
```

---

## Çalıştırma Sırası

1. **#4** Turbo NODE_ENV → tek satır, 0 risk, hemen yap
2. **#2** API PG Pool → küçük değişiklik, büyük etki
3. **#1** Rate Limiting → yeni paket + decorator'lar, orta scope
4. **#3** Migration Checksum → yeni migration + runner değişikliği
5. **#6** BullMQ Config → dikkatli çakışma analizi gerekiyor
6. **#5** Correlation ID → altyapı kurulumu, scope geniş ama acil değil
