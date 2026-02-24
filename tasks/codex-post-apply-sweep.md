# Codex Prompts — Post-Apply Sweep & Fix

> Bu prompt'lar diğer 4 prompt dosyası uygulandıktan SONRA çalıştırılır.
> Amaç: Tüm refactor, yeni feature ve config değişikliklerinin yarattığı kırılmaları tespit edip düzeltmek.
> Sıra: Her batch sonrası ilgili sweep'i çalıştır, sonunda full sweep yap.

---

## 🔴 1. Full Build + Typecheck Sweep

```
Proje: pnpm monorepo (apps/api, apps/web, apps/worker, packages/shared, packages/ui)

Önceki prompt'larda yapılan değişiklikler type hatalarına, import kırılmalarına ve build
hatalarına yol açmış olabilir. Bu prompt tüm kırılmaları bulur ve düzeltir.

Adımlar:

1. TypeScript type check çalıştır ve TÜÜM hataları topla:
   pnpm typecheck 2>&1 | tee /tmp/typecheck-errors.txt

2. Hata analizi yap — her hata için:
   a. Import kırılması (Cannot find module, has no exported member):
      - Refactor sırasında taşınan/yeniden adlandırılan export'ları bul
      - Tüm import eden dosyaları güncelle (grep ile bul)
   b. Type uyumsuzluğu (Type X is not assignable to Y):
      - Interface genişletmeleri optional field olarak eklenmişse → call site'lar OK
      - Eğer required field eklendiyse → tüm call site'lara default value ekle
   c. Missing property (Property X does not exist on type Y):
      - Yeni eklenen field'lar için type tanımını güncelle
   d. Strict flag kırılmaları (noUncheckedIndexedAccess, noUnusedLocals vb.):
      - array[index] erişimleri → if guard veya non-null assertion ekle
      - Kullanılmayan değişkenler → sil veya _prefix ekle
      - Kullanılmayan import'lar → sil

3. Her düzeltmeden sonra incremental typecheck:
   pnpm --filter <etkilenen-paket> typecheck

4. Tüm hatalar düzeltildikten sonra full typecheck:
   pnpm typecheck

Kısıtlar:
- "as any" ile type hatasını bastırma — doğru type'ı bul
- @ts-ignore / @ts-expect-error ekleme — hatanın kök nedenini çöz
- noInlineConfig: true aktif — eslint-disable satır içi yorumlar çalışmaz

Doğrulama:
  pnpm typecheck  (0 hata)
```

---

## 🔴 2. ESLint Full Sweep

```
Proje: pnpm monorepo
Önceki prompt'larda yeni dosyalar oluşturulmuş, mevcut dosyalar refactor edilmiş olabilir.
Yeni ESLint kuralları (complexity, max-lines-per-function, max-depth, max-params) ihlalleri
oluşmuş olabilir.

Adımlar:

1. Full lint çalıştır:
   pnpm lint 2>&1 | tee /tmp/lint-errors.txt

2. Hata kategorileri ve çözümleri:

   a. max-lines-per-function (80 satır aşımı):
      - Yeni oluşturulan helper fonksiyonlar 80 satırı geçiyorsa → tekrar böl
      - Test dosyalarındaki büyük describe blokları → daha küçük describe'lara böl
      - React bileşenleri → alt bileşenlere extract et

   b. complexity (15 üzeri cyclomatic complexity):
      - Switch/if zincirleri → lookup map/object pattern'e dönüştür
      - Nested conditional'lar → early return pattern uygula

   c. max-depth (4 üzeri nesting):
      - İç içe if/for/try → extract function veya early return

   d. max-params (4 üzeri parametre):
      - Options object pattern'e dönüştür
      - Tüm call site'ları güncelle

   e. no-console (yeni eklenen kodda console.log):
      - createLogger(scope) kullan (packages/shared/src/observability/logger.ts)
      - API'de NestJS Logger kullan

   f. no-restricted-imports (cross-app import):
      - apps/web'den apps/api import etme
      - Shared kod packages/* altına taşı

   g. @typescript-eslint/no-explicit-any:
      - "any" kullanımlarını proper type ile değiştir
      - Gerekirse unknown + type guard kullan

3. Her düzeltmeden sonra dosya bazlı lint:
   pnpm lint -- <dosya-yolu>

4. Full lint:
   pnpm lint  (0 hata)

Kısıtlar:
- noInlineConfig: true — eslint-disable yorumları çalışmaz, kuralı kod ile çöz
- reportUnusedDisableDirectives: "error" — gereksiz disable yorumları da hata
- Mevcut davranışı değiştirme, sadece lint uyumu sağla

Doğrulama:
  pnpm lint  (0 hata)
```

---

## 🔴 3. Unit + Integration Test Sweep

```
Proje: pnpm monorepo
Refactor ve yeni feature'lar mevcut testleri kırmış olabilir.

Adımlar:

1. Tüm unit testleri çalıştır:
   pnpm test:unit 2>&1 | tee /tmp/unit-test-errors.txt

2. Tüm integration testleri çalıştır (DB + Redis gerekli):
   pnpm db:up && pnpm db:migrate && pnpm test:integration 2>&1 | tee /tmp/integration-test-errors.txt

3. Hata analizi — her failing test için:

   a. Import/require hataları:
      - Refactor sırasında taşınan modüllerin test import'larını güncelle

   b. Function signature değişiklikleri:
      - Options object pattern'e geçildiyse → test'teki çağrıları güncelle
      - Yeni required parameter eklendiyse → test'e ekle
      - Return type değiştiyse → assertion'ları güncelle

   c. Mock kırılmaları:
      - Fonksiyon extract edilmişse → mock target'ı güncelle
      - Yeni dependency enjekte edildiyse → mock ekle

   d. DB schema değişiklikleri (yeni migration):
      - Yeni tablo/kolon → test fixture'larını güncelle
      - Integration test'ler migration sonrası çalıştığından otomatik olmalı
      - Seed data değişiklikleri → test expectation'larını güncelle

   e. Assertion hataları:
      - Response format değişikliği → expected value güncelle
      - Yeni alanlar eklendiyse → assertion'a ekle veya partial match kullan

4. Her düzeltmeden sonra sadece failing test'i çalıştır:
   pnpm --filter <paket> test -- --test-name-pattern "<test-adı>"

5. Full test suite:
   pnpm test:unit && pnpm test:integration

Kısıtlar:
- Test'i sildirme — düzelt
- Assertion'ı gevşetme (expect.anything() vb.) — doğru değeri bul
- Skip/todo ekleme — testi çalışır hale getir
- Mock'u genişlet ama davranışı değiştirme

Doğrulama:
  pnpm test:unit  (0 fail)
  pnpm test:integration  (0 fail)
```

---

## 🟡 4. E2E Test Sweep

```
Proje: Playwright E2E (apps/web/e2e)
UI refactor'ları (analytics chart, takvim, bileşen bölme) E2E testleri kırmış olabilir.

Adımlar:

1. E2E testleri çalıştır:
   pnpm test:e2e 2>&1 | tee /tmp/e2e-errors.txt

2. Hata analizi:
   a. Selector kırılması — bileşen yapısı değiştiyse:
      - Page object'leri güncelle (apps/web/e2e/pages/)
      - data-testid attribute'ları yeni bileşenlere taşı
   b. Mock API uyumsuzluğu — endpoint response format değişikliği:
      - apps/web/e2e/mock-api/server.mjs güncelle
   c. Timing hataları — yeni async bileşenler:
      - waitForSelector veya waitForResponse ekle

3. Full E2E:
   pnpm test:e2e

Kısıtlar:
- Yeni E2E test yazma — sadece kırılanları düzelt
- Flaky pattern ekleme (sleep, arbitrary timeout)

Doğrulama:
  pnpm test:e2e  (0 fail)
```

---

## 🟡 5. Build + Bundle Sweep

```
Proje: pnpm monorepo (turbo build)
Yeni paketler, import değişiklikleri, veya config güncellemeleri build'i kırmış olabilir.

Adımlar:

1. Full build:
   pnpm build 2>&1 | tee /tmp/build-errors.txt

2. Hata kategorileri:
   a. Module not found:
      - Yeni eklenen paketler install edilmemiş → pnpm install
      - Workspace dependency eksik → package.json'a ekle
   b. Next.js build hataları:
      - Server/client boundary ihlali → "use client" directive ekle
      - Dynamic import gereksinimi (Recharts SSR uyumsuz) → next/dynamic kullan
   c. TypeScript emit hataları:
      - tsconfig.build.json include/exclude güncellemesi gerekebilir
   d. Circular dependency:
      - Refactor sırasında oluşmuş olabilir → dependency graph'ı düzelt

3. Her app ayrı build:
   pnpm --filter @growth-os/api build
   pnpm --filter @growth-os/web build
   pnpm --filter @growth-os/worker build

4. Full build:
   pnpm build

Kısıtlar:
- Build çıktısını değiştirme (dist/, .next/ dizinleri)
- turbo.json pipeline'ını değiştirme
- Yeni build step ekleme

Doğrulama:
  pnpm build  (0 hata)
```

---

## 🟡 6. Format + Prettier Sweep

```
Proje: Prettier 3.4 + lint-staged
Yeni ve değiştirilen dosyalar Prettier formatına uymuyor olabilir.

Adımlar:

1. Format kontrolü:
   pnpm format:check 2>&1 | tee /tmp/format-errors.txt

2. Otomatik düzelt:
   pnpm format

3. Kontrol et — format sonrası değişen dosyalar:
   git diff --name-only

4. Değişiklik varsa format uygula, yoksa geç.

Doğrulama:
  pnpm format:check  (0 hata)
```

---

## 🔴 7. Full Quality Gate (Final)

```
Proje: pnpm monorepo
Tüm sweep'ler tamamlandıktan sonra full quality gate çalıştır.

Adımlar:

1. Quality gate çalıştır:
   pnpm quality:gate 2>&1 | tee /tmp/quality-gate.txt

   Bu sırayla çalışır:
   - pnpm format:check
   - pnpm lint
   - pnpm typecheck
   - pnpm test:unit
   - pnpm test:integration
   - pnpm coverage:project
   - pnpm build

2. Coverage eşiklerini kontrol et:
   - Her paketin coverage raporu çıkar
   - Eşik altında kalan paketler varsa → eksik testleri yaz

3. Herhangi bir adım fail ediyorsa:
   - İlgili sweep prompt'una geri dön (#1-#6)
   - Düzelt ve tekrar quality gate çalıştır

4. Tümü geçtikten sonra son kontrol:
   git status  (unexpected dosya değişikliği var mı?)
   git diff --stat  (değişiklik scope'u makul mü?)

Doğrulama:
  pnpm quality:gate  (0 hata, tüm adımlar yeşil)
```

---

## Çalıştırma Sırası

Her prompt batch'i sonrası ilgili sweep'leri çalıştır:

| Batch                                                          | Sonra Çalıştır                                          |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| complexity-fix (ESLint refactor)                               | #2 ESLint → #1 Typecheck → #3 Tests → #5 Build          |
| infra-hardening (rate limit, pool, migration)                  | #1 Typecheck → #3 Tests → #5 Build                      |
| senior-audit (helmet, exceptions, health)                      | #1 Typecheck → #3 Tests → #5 Build                      |
| faz1-features (X refresh, LLM style, charts, calendar, alerts) | #1 Typecheck → #2 ESLint → #3 Tests → #4 E2E → #5 Build |
| **Tüm batch'ler bitti**                                        | **#6 Format → #7 Full Quality Gate**                    |
