# Codex Prompt: NestJS 10→11 + Fastify 4→5 + Nodemailer 6→7 Upgrade

> Bu prompt, `growth-os` monorepo'sundaki guvenlik zafiyetlerini temiz sekilde cozmek icin hazirlandi.
> Hedef: CI'daki `pnpm audit --prod --audit-level high` adimini gecirmek.

---

## GOREV

`apps/api` paketindeki 3 high-severity guvenlik zafiyetini, NestJS 10→11, Fastify 4→5 ve Nodemailer 6→7 major upgrade yaparak kapat. Monorepo'nun geri kalanini (web, worker, shared, ui) kirma.

## ZAFIYETLER

1. `@fastify/middie <=9.0.3` (Path Bypass) → `>=9.1.0` gerekli → NestJS 11 + Fastify 5 ile gelir
2. `fastify <5.7.2` (Content-Type body validation bypass) → `>=5.7.2` gerekli → Fastify 5 ile gelir
3. `nodemailer <=7.0.10` (DoS recursive addressparser) → `>=7.0.11` gerekli

## PROJE BAĞLAMI

- Monorepo: pnpm workspaces + Turborepo
- Node.js: 22 (zaten uyumlu, NestJS 11 min v20 istiyor)
- Package manager: pnpm 9.12.0
- Test runner: Node.js native test runner (`node:test` + `node:assert/strict`)
- Sadece `apps/api/package.json` etkilenir, diger app'ler NestJS kullanmiyor

## GUNCELLENECEK PAKETLER

`apps/api/package.json` icinde:

```
@nestjs/common:           10.4.15 → 11.x (latest stable)
@nestjs/core:             10.4.15 → 11.x (latest stable)
@nestjs/platform-fastify: 10.4.15 → 11.x (latest stable)
fastify:                  4.28.1  → 5.x  (platform-fastify 11'in cektigi versiyon ile uyumlu)
@fastify/cors:            9.0.1   → 10.x (Fastify 5 uyumlu versiyon)
nodemailer:               6.9.16  → 7.x  (>=7.0.11)
@types/nodemailer:        6.4.17  → 7.x  (varsa, yoksa kaldir)
```

Degismeyecek paketler: reflect-metadata, bullmq, ioredis, pg, rxjs, zod, dotenv, better-auth, tsx, c8, ts-node-dev, typescript

## BREAKING CHANGE HARITASI VE COZUMLERI

### 1. Fastify 5: `reply.redirect()` imza degisikligi

**Dosya:** `apps/api/src/modules/auth/auth.controller.ts`
**Satirlar:** 264, 271

```typescript
// ESKI (Fastify 4):
response.redirect(302, redirectTarget);

// YENI (Fastify 5):
response.redirect(redirectTarget, 302);
```

Bu dosyada 2 adet `response.redirect(302, ...)` cagrisi var. Her ikisini de `response.redirect(url, code)` formatina cevir.

### 2. Fastify 5: CORS metod kisitlamasi

**Dosya:** `apps/api/src/main.ts`
**Satirlar:** 49-59

Fastify 5'te CORS default olarak sadece "safelisted" HTTP method'larina izin verir. API'deki controller'larda GET, POST kullaniliyor. Ayrica ileride PUT, PATCH, DELETE de eklenebilir. CORS registration'a `methods` alani ekle:

```typescript
await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || allowlist.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
});
```

### 3. NestJS 11: Reflector.getAllAndOverride donus tipi `T | undefined`

**Dosya:** `apps/api/src/shared/auth/session-auth.guard.ts`
**Satir:** 175

```typescript
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
  context.getHandler(),
  context.getClass()
]);
```

Onceden `T` donuyordu, simdi `T | undefined` donuyor. Mevcut kod zaten `isPublic`'i truthy check ile kullaniyor olmali. Eger `if (isPublic)` seklindeyse sorun yok. Eger `if (isPublic === true)` seklindeyse `if (isPublic === true)` olarak kalabilir. Type uyumunu kontrol et, gerekirse `?? false` ekle.

### 4. NestJS 11: Modul cozumleme (Module Resolution)

**Dosya:** `apps/api/src/app.module.ts`

NestJS 11'de dinamik moduller artik "opaque key" yerine "object reference" ile karsilastirilir. Bu projede dinamik modul (forRoot, forRootAsync vb.) KULLANILMIYOR — sadece duz `@Module` decorator'u var. Bu breaking change bu projeyi ETKİLEMEZ. Dokunma.

### 5. NestJS 11: Lifecycle hook siralama degisikligi

Sonlandirma hook'lari artik baslangic siralamasinin tersinde calisir. Bu projede `app.enableShutdownHooks()` ve bir `onClose` fastify hook var (`main.ts` satir 41). Bu mantiken bir sorun yaratmaz cunku tek bir cleanup fonksiyonu var (`closePool`). Dokunma.

### 6. Nodemailer 6→7: SES API degisikligi

**Dosya:** `apps/api/src/modules/auth/better-auth.ts`
**Satirlar:** 188-219

Bu projede AWS SES KULLANILMIYOR. SMTP transport kullaniliyor:

```typescript
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: false,
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
});
```

Bu SMTP kullanimi Nodemailer 7'de degismiyor. Sadece versiyon guncelle yeterli.

Ancak `@types/nodemailer` paketinin 7.x ile uyumlu versiyonunu kontrol et. Eger `@types/nodemailer@7.x` yoksa, Nodemailer 7 kendi tiplerini iceriyorsa `@types/nodemailer`'i kaldir.

### 7. Fastify 5: Logger degisikligi

**Dosya:** `apps/api/src/main.ts` satir 35

```typescript
new FastifyAdapter({ logger: false });
```

Fastify 5'te `logger` opsiyonu artik custom logger INSTANCE kabul etmiyor ama `false` veya pino opsiyonlari hala gecerli. `logger: false` sorunsuz calisir. Dokunma.

### 8. Fastify 5: `.getHttpAdapter().getInstance()` kullanimi

**Dosya:** `apps/api/src/main.ts` satirlar 38-43

```typescript
app
  .getHttpAdapter()
  .getInstance()
  .addHook("onClose", async () => {
    await closePool();
  });
```

Bu pattern Fastify 5'te de gecerli. `getInstance()` raw Fastify instance'i doner ve `addHook` Fastify 5'te ayni API'yi kullaniyor. Dokunma.

### 9. Fastify 5: Request params prototype degisikligi

Bu projede `request.params`'a `hasOwnProperty` veya prototype method'lariyla erisilmiyor. NestJS `@Param()` decorator'u kullaniliyor. Dokunma.

### 10. @fastify/cors 9→10: API uyumlulugu

Callback-based `origin` fonksiyonu Fastify 5 uyumlu `@fastify/cors` 10'da da destekleniyor. Sadece `methods` alanini ekle (madde 2).

## ADIM ADIM UYGULAMA PLANI

1. `apps/api/package.json` icindeki versiyonlari guncelle
2. Root'ta `pnpm install` calistir (lockfile guncellenir)
3. `apps/api/src/modules/auth/auth.controller.ts` → `response.redirect(302, url)` cagrilarini `response.redirect(url, 302)` olarak duzelt (2 adet)
4. `apps/api/src/main.ts` → CORS registration'a `methods` ekle
5. `apps/api/src/shared/auth/session-auth.guard.ts` → Reflector donus tipini kontrol et, gerekirse `?? false` ekle
6. `@types/nodemailer` versiyonunu kontrol et: 7.x varsa guncelle, yoksa kaldir (nodemailer 7 kendi tiplerini iceriyorsa)
7. Dogrulama:
   - `pnpm typecheck` → hata yok
   - `pnpm test:unit` → hata yok
   - `pnpm test:integration` → hata yok
   - `pnpm --filter @growth-os/api build` → basarili
   - `pnpm audit --prod --audit-level high` → 0 high vulnerability
8. Eger yeni bir uyari/hata cikarsa, hatayi oku ve bu prompt'taki breaking change bilgilerine gore duzelt

## DOKUNMA KURALLARI

- `apps/web/` → DOKUNMA
- `apps/worker/` → DOKUNMA
- `packages/` → DOKUNMA
- `tsconfig` dosyalari → DOKUNMA (experimentalDecorators ve emitDecoratorMetadata kalacak)
- `reflect-metadata` import'u → DOKUNMA (main.ts satir 1, ilk import olmali)
- Testlerdeki mock yapilari → framework mock'u yok, sadece pure function testleri var, buyuk ihtimalle degisiklik gerekmez
- BullMQ entegrasyonu → NestJS wrapper kullanmiyor, raw BullMQ, degisiklik gerekmez

## DOGRULAMA CHECKLIST

```bash
# 1. Zafiyet taramasi
pnpm audit --prod --audit-level high
# Beklenen: 0 high vulnerability

# 2. TypeScript derleme
pnpm typecheck
# Beklenen: apps/api ve apps/worker hatasiz (apps/web'de onceden var olan ContentMode hatasi olabilir, o bizim degil)

# 3. Unit testler
pnpm test:unit
# Beklenen: tum testler gecer

# 4. Integration testler
pnpm test:integration
# Beklenen: tum testler gecer

# 5. Build
pnpm --filter @growth-os/api build
# Beklenen: basarili

# 6. Worker build (etkilenmemeli)
pnpm --filter @growth-os/worker build
# Beklenen: basarili
```

## BASARISIZLIK DURUMLARI

- Eger `@fastify/cors` 10.x, callback-based origin'i desteklemiyorsa: origin fonksiyonunu array-based'e cevir
- Eger `better-auth` NestJS 11 / Fastify 5 ile uyumsuzsa: better-auth versiyonunu da guncelle (`npm view better-auth versions`)
- Eger `@types/nodemailer` 7.x yoksa ve nodemailer 7 kendi type'larini icermiyorsa: `@types/nodemailer`'i `devDependencies`'den kaldir ve import'lari `any` ile gecici olarak type-safe yap, sonra duzelt
- Eger integration testlerinde Reflector davranisi degistiyse: `getAllAndOverride` sonucuna `?? false` ekle
