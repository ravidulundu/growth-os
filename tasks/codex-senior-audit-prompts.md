# Codex Prompts — Senior Audit Bulguları

> Öncelik sırasına göre. Her prompt bağımsız.
> Tech stack: NestJS 11 + Fastify 5 + PostgreSQL 16 (pg) + Redis 7 + Node 22

---

## 🔴 1. Fastify Helmet — Security Headers

```
Proje: NestJS 11 + Fastify 5 (apps/api)
Sorun: API response'larında hiçbir güvenlik header'ı yok — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection hepsi eksik. Clickjacking, MIME sniffing ve XSS'e açık.

Mevcut durum:
- apps/api/src/main.ts: 72 satır. CORS @fastify/cors ile register edilmiş (satır 49-60).
- Helmet veya benzeri güvenlik middleware YOK.
- Fastify adapter kullanılıyor (Express değil) — @fastify/helmet gerekli, helmet değil.
- apps/api/package.json dependencies: @fastify/cors var, @fastify/helmet YOK.

Yapılacaklar:

1. @fastify/helmet paketini kur:
   cd apps/api && pnpm add @fastify/helmet

2. apps/api/src/main.ts'e helmet register et (CORS'tan ÖNCE, satır 48'den önce):

   import helmet from "@fastify/helmet";

   // Security headers — registered before CORS to ensure headers on all responses
   await app.register(helmet, {
     contentSecurityPolicy: {
       directives: {
         defaultSrc: ["'self'"],
         scriptSrc: ["'self'"],
         styleSrc: ["'self'", "'unsafe-inline'"],
         imgSrc: ["'self'", "data:", "https:"],
         connectSrc: ["'self'"],
         fontSrc: ["'self'"],
         objectSrc: ["'none'"],
         frameSrc: ["'none'"],
         baseUri: ["'self'"],
         formAction: ["'self'"]
       }
     },
     crossOriginEmbedderPolicy: false,
     crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
   });

   NOT: crossOriginEmbedderPolicy: false çünkü API JSON döndürüyor, cross-origin embed gerekmiyor.
   CSP directifleri API için sıkı tutuldu — frontend asset serve etmiyoruz.

3. CSP'yi production/development için ayır:
   - Development'ta CSP daha gevşek olabilir (debug toolları)
   - Production'da strict CSP

Kısıtlar:
- Mevcut CORS registration'ı değiştirme (satır 49-60)
- app.enableShutdownHooks() ve onClose hook'unu değiştirme
- Bootstrap flow sırasını bozma: helmet → cors → listen

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/api test:unit
  # Manuel: curl -I http://localhost:4000/health → X-Frame-Options, CSP header'ları göründüğünü doğrula
```

---

## 🔴 2. Global Exception Handlers (API + Worker)

```
Proje: NestJS 11 API (apps/api) + BullMQ Worker (apps/worker)
Sorun: process.on("unhandledRejection") ve process.on("uncaughtException") handler'ları her iki entrypoint'te de YOK. Promise rejection'lar sessizce yutulabilir, uncaught exception'lar stack trace olmadan process'i öldürebilir.

Mevcut durum:
- apps/api/src/main.ts (72 satır):
  - Sadece bootstrap().catch() var (satır 68-71)
  - Global process handler YOK
- apps/worker/src/main.ts (1074 satır):
  - SIGINT/SIGTERM handler'ları var (satır 1068-1073)
  - unhandledRejection/uncaughtException handler YOK
- Shared logger: packages/shared/src/observability/logger.ts — createLogger(scope) kullanılıyor

Yapılacaklar:

1. apps/api/src/main.ts — satır 67'den önce (bootstrap çağrısından önce) ekle:

   const bootstrapLogger = new Logger("Process");

   process.on("unhandledRejection", (reason) => {
     bootstrapLogger.error(
       "Unhandled Promise Rejection — this indicates a missing .catch() or await",
       reason instanceof Error ? reason.stack : String(reason)
     );
     if (process.env.NODE_ENV === "production") {
       process.exit(1);
     }
   });

   process.on("uncaughtException", (error) => {
     bootstrapLogger.error("Uncaught Exception — process will exit", error.stack);
     process.exit(1);
   });

2. apps/worker/src/main.ts — SIGINT/SIGTERM handler'larından ÖNCE (satır 1067 civarı) ekle:

   process.on("unhandledRejection", (reason) => {
     logger.error("unhandled promise rejection", reason instanceof Error ? reason : undefined, {
       reason: reason instanceof Error ? reason.message : String(reason)
     });
     if (process.env.NODE_ENV === "production") {
       void shutdown("unhandledRejection");
     }
   });

   process.on("uncaughtException", (error) => {
     logger.error("uncaught exception — shutting down", error);
     void shutdown("uncaughtException");
   });

   NOT: Worker'da her iki durumda da graceful shutdown çağrılmalı — BullMQ worker'ı düzgün kapatmak için.
   API'de ise NestJS'in kendi shutdown hook'ları zaten var (app.enableShutdownHooks()).

Kısıtlar:
- Mevcut shutdown() fonksiyonunu değiştirme
- Logger import'larını değiştirme
- API'de NestJS Logger, Worker'da shared createLogger kullan (mevcut pattern)

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/worker test
```

---

## 🟡 3. Deep Health Check (DB + Redis)

```
Proje: NestJS 11 API (apps/api)
Sorun: Health endpoint sadece { status: "ok" } döndürüyor — DB veya Redis down olsa bile 200 OK döner. Load balancer sağlıksız instance'a trafik yönlendirmeye devam eder.

Mevcut dosya — apps/api/src/shared/health/health.controller.ts (15 satır):
  @Controller("health")
  @Public()
  export class HealthController {
    @Get()
    healthcheck() {
      return { status: "ok", service: "api", timestamp: new Date().toISOString() };
    }
  }

Mevcut altyapı:
- DB pool: apps/api/src/shared/db/pool.ts → getPool() döndürüyor (pg.Pool)
- Redis: apps/api/src/modules/scheduling/queue.ts → connection() döndürüyor (IORedis)
  - Ama queue.ts'deki Redis private, export edilmiyor
- @Public() decorator'ü: Auth bypass (health check'te olması doğru)

Yapılacaklar:

1. Redis bağlantısını health check'te kullanılabilir yap:
   - apps/api/src/modules/scheduling/queue.ts'den Redis connection'ı export et
   - VEYA apps/api/src/shared/db/ altında redis-pool.ts oluştur (daha temiz)
   - Tercih: queue.ts'deki mevcut connection()'ı getRedisConnection() olarak export et

2. apps/api/src/shared/health/health.controller.ts'i güncelle:

   import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
   import { Public } from "../auth/public.decorator";
   import { getPool } from "../db/pool";
   import { FastifyReply } from "fastify";

   @Controller("health")
   @Public()
   export class HealthController {
     @Get()
     async healthcheck(@Res() reply: FastifyReply) {
       const db = await this.checkDatabase();
       const redis = await this.checkRedis();
       const healthy = db.ok && redis.ok;

       const body = {
         status: healthy ? "ok" : "degraded",
         service: "api",
         timestamp: new Date().toISOString(),
         dependencies: {
           database: db,
           redis: redis
         }
       };

       return reply.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).send(body);
     }

     private async checkDatabase(): Promise<{ ok: boolean; latencyMs?: number }> {
       const start = Date.now();
       try {
         await getPool().query("SELECT 1");
         return { ok: true, latencyMs: Date.now() - start };
       } catch {
         return { ok: false };
       }
     }

     private async checkRedis(): Promise<{ ok: boolean; latencyMs?: number }> {
       const start = Date.now();
       try {
         const redis = getRedisConnection(); // queue.ts'den import
         await redis.ping();
         return { ok: true, latencyMs: Date.now() - start };
       } catch {
         return { ok: false };
       }
     }
   }

3. CI smoke test güncellesi:
   - .github/workflows/ci.yml'deki health check integration test'i 503 durumunu da handle etmeli

Kısıtlar:
- @Public() decorator'ünü kaldırma (auth bypass zorunlu)
- /health path'ini değiştirme
- Latency check'te timeout ekle — 5 saniyeden uzun sürerse false dön

Doğrulama:
  pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit
  # Manuel: docker compose down && curl http://localhost:4000/health → 503 + degraded beklenir
```

---

## 🟡 4. TypeScript Strict Flags

```
Proje: TypeScript 5.7 monorepo, tsconfig base (packages/config/tsconfig/base.json)
Sorun: strict: true açık ama ek güvenlik flag'leri eksik. Array[index] undefined olabilir (noUncheckedIndexedAccess), kullanılmayan değişkenler birikir (noUnusedLocals), switch fallthrough bug'ları mümkün.

Mevcut tsconfig base (packages/config/tsconfig/base.json, 16 satır):
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "CommonJS",
      "moduleResolution": "Node",
      "strict": true,
      "noImplicitAny": true,
      "allowSyntheticDefaultImports": true,
      "esModuleInterop": true,
      "resolveJsonModule": true,
      "forceConsistentCasingInFileNames": true,
      "skipLibCheck": true,
      "baseUrl": "."
    }
  }

Yapılacaklar:

1. packages/config/tsconfig/base.json'a şu flag'leri ekle:

   "noUncheckedIndexedAccess": true,
   "noUnusedLocals": true,
   "noUnusedParameters": true,
   "noImplicitReturns": true,
   "noFallthroughCasesInSwitch": true

2. pnpm typecheck çalıştır ve hata sayısını raporla.

3. Eğer noUnusedLocals / noUnusedParameters çok fazla hata veriyorsa:
   - SADECE bu ikisini "warn" seviyesinde değil, error olarak bırak
   - Ama ilk geçiş için: mevcut hataları underscore prefix ile fixle (_unusedParam)
   - VEYA: noUnusedLocals ve noUnusedParameters'ı bu PR'da EKLEMEYİP ayrı PR'da yap

4. noUncheckedIndexedAccess eklendikten sonra:
   - array[0] erişimleri T | undefined dönecek
   - Mevcut kodda "!" assertion veya if guard gerekebilir
   - Hata sayısına göre karar ver: çok fazlaysa ayrı PR

Kısıtlar:
- Sadece base tsconfig'i değiştir (apps extend eder)
- Mevcut "strict": true'yu kaldırma
- Hata sayısı 90'den fazlaysa noUncheckedIndexedAccess'i EKLEME, issue aç

Doğrulama:
  pnpm typecheck 2>&1 | tail -5  (hata sayısını göster)
```

---

## 🟡 5. Node/pnpm Version Locking (.nvmrc + engines + .npmrc)

```
Proje: pnpm 9.12 monorepo, Node 22, CI: node-version: 22
Sorun: .nvmrc yok, package.json'da engines yok, .npmrc yok. Geliştirici farklı Node versiyonuyla çalışabilir, peer dependency uyumsuzlukları sessiz geçer.

Mevcut durum:
- package.json: "packageManager": "pnpm@9.12.0" (corepack desteği ✓)
- CI (.github/workflows/ci.yml): node-version: 22 (hardcoded)
- .nvmrc: YOK
- .npmrc: YOK
- engines: YOK

Yapılacaklar:

1. Repo root'a .nvmrc oluştur:
   22

2. Repo root'a .npmrc oluştur:
   strict-peer-dependencies=true
   auto-install-peers=true
   shamefully-hoist=false

3. Root package.json'a engines ekle ("packageManager" satırından sonra):
   "engines": {
     "node": ">=22.0.0",
     "pnpm": ">=9.12.0"
   }

Kısıtlar:
- packageManager field'ını değiştirme
- Mevcut scripts'leri değiştirme
- pnpm install çalışmaya devam etmeli

Doğrulama:
  node -v  (22.x olmalı)
  pnpm install  (peer dependency hataları varsa raporla)
```

---

## ⚪ 6. .editorconfig

```
Proje: Monorepo — TypeScript, JSON, YAML, Markdown, SQL dosyaları
Sorun: .editorconfig yok. Farklı IDE'ler farklı indent/encoding kullanabilir, Prettier ile çakışma riski.

Mevcut prettier config (.prettierrc.json):
  semi: true, singleQuote: false, trailingComma: "none", printWidth: 100, tabWidth: 2

Yapılacaklar:

1. Repo root'a .editorconfig oluştur (prettier ile uyumlu):

   root = true

   [*]
   end_of_line = lf
   insert_final_newline = true
   charset = utf-8
   indent_style = space
   indent_size = 2
   trim_trailing_whitespace = true

   [*.md]
   trim_trailing_whitespace = false

   [*.sql]
   indent_size = 2

   [Makefile]
   indent_style = tab

Kısıtlar:
- Prettier config ile çelişme (tabWidth: 2 = indent_size: 2 ✓)
- Mevcut dosyaların formatını bozma

Doğrulama:
  pnpm format:check  (mevcut formatlama hala geçerli olmalı)
```

---

## Çalıştırma Sırası

1. **#5** — .nvmrc + engines + .npmrc (dosya oluşturma, 0 risk)
2. **#6** — .editorconfig (dosya oluşturma, 0 risk)
3. **#1** — Helmet (paket + register, düşük risk)
4. **#2** — Exception handlers (entrypoint değişikliği, düşük risk)
5. **#4** — TypeScript strict (hata sayısına göre scope değişir)
6. **#3** — Deep health check (Redis export + controller refactor)
