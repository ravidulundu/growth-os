# Codex Prompts — ESLint Complexity İhlallerini Düzelt

> Her prompt bağımsız çalışır. Codex'e tek tek ver.
> Kural referansı: `max-lines-per-function: 80`, `max-depth: 4`, `complexity: 15`, `max-params: 4`, `max-nested-callbacks: 3`
> Doğrulama: her fix sonrası `pnpm lint -- --no-error-on-unmatched-pattern <dosya>` ile kontrol et.

---

## 1. CRITICAL — Worker processPublishJob (552 satır, complexity 38, depth 7)

```
Dosya: apps/worker/src/main.ts
Fonksiyon: processPublishJob (satır 177)

Bu fonksiyon 552 satır, cyclomatic complexity 38, max-depth 7. Tüm ESLint kurallarını ihlal ediyor.

Refactor kuralları:
- Fonksiyonu mantıksal adımlara böl: prepareDraft, publishToX, handleMetrics, handleRetry, updateStatus gibi.
- Her yardımcı fonksiyon max 80 satır, complexity ≤15 olmalı.
- Nesting depth 4'ü geçen blokları early return veya extract function ile düzelt.
- Satır 565, 581, 586, 643'teki deeply nested blokları özellikle hedefle.
- Mevcut davranışı değiştirme, sadece yapısal refactor yap.
- Yeni fonksiyonlar aynı dosyada kalabilir. Export etme, private helper olarak bırak.

Doğrulama: pnpm lint -- apps/worker/src/main.ts && pnpm --filter @growth-os/worker test
```

---

## 2. CRITICAL — useStudioController (452 satır)

```
Dosya: apps/web/components/studio/use-studio-controller.ts
Fonksiyon: useStudioController (satır 66)

Bu React hook 452 satır. max-lines-per-function: 80 ihlali.

Refactor kuralları:
- Hook'u daha küçük custom hook'lara böl: useStudioDrafts, useStudioPublish, useStudioAnalytics vb.
- Her hook tek bir concern'ü ele alsın.
- Ana useStudioController bu hook'ları compose etsin.
- Hook'lar aynı dizinde ayrı dosyalarda olabilir veya aynı dosyada kalabilir (80 satır sınırına uyduğu sürece).
- Mevcut dışa açılan API'yi (return type) değiştirme.

Doğrulama: pnpm lint -- apps/web/components/studio/use-studio-controller.ts && pnpm --filter @growth-os/web build
```

---

## 3. CRITICAL — session-auth.guard.ts (canActivate: 189 satır/complexity 33, extractScopedResourceIds: complexity 21)

```
Dosya: apps/api/src/shared/auth/session-auth.guard.ts
Fonksiyonlar:
  - canActivate (satır 171): 189 satır, complexity 33
  - extractScopedResourceIds (satır 98): complexity 21

Refactor kuralları:
- canActivate'i adımlara böl: validateSession, resolveWorkspace, checkPermissions, handleScopedResources.
- extractScopedResourceIds'deki switch/if zincirini bir lookup map veya strategy pattern ile değiştir.
- Her yardımcı max 80 satır, complexity ≤15.
- Guard'ın NestJS decorator davranışını (CanActivate interface) değiştirme.
- Auth/izin mantığında davranış değişikliği yapma.

Doğrulama: pnpm lint -- apps/api/src/shared/auth/session-auth.guard.ts && pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration
```

---

## 4. scheduling.service.ts — schedule (186 satır, complexity 17)

```
Dosya: apps/api/src/modules/scheduling/scheduling.service.ts
Fonksiyon: schedule (satır 36): 186 satır, complexity 17

Refactor kuralları:
- Fonksiyonu aşamalara böl: validateScheduleInput, resolvePublishTime, enqueueJob, handleDedupe vb.
- Her helper max 80 satır, complexity ≤15.
- Mevcut servis API'sini (public method signature) değiştirme.

Doğrulama: pnpm lint -- apps/api/src/modules/scheduling/scheduling.service.ts && pnpm --filter @growth-os/api test:unit
```

---

## 5. auth.controller.ts — mapBetterAuthError (complexity 18)

```
Dosya: apps/api/src/modules/auth/auth.controller.ts
Fonksiyon: mapBetterAuthError (satır 179): complexity 18

Refactor kuralları:
- Switch/if zincirini bir error mapping object'e dönüştür: Record<string, { status, message }>.
- Lookup + fallback pattern kullan. complexity ≤15 olmalı.

Doğrulama: pnpm lint -- apps/api/src/modules/auth/auth.controller.ts && pnpm --filter @growth-os/api test:unit
```

---

## 6. better-auth.ts — createBetterAuthInstance (137 satır)

```
Dosya: apps/api/src/modules/auth/better-auth.ts
Fonksiyon: createBetterAuthInstance (satır 215): 137 satır

Refactor kuralları:
- Config oluşturma bloklarını helper fonksiyonlara çıkar: buildPlugins, buildSessionConfig, buildEmailConfig vb.
- Ana fonksiyon bu helper'ları compose etsin. Max 80 satır.

Doğrulama: pnpm lint -- apps/api/src/modules/auth/better-auth.ts && pnpm --filter @growth-os/api test:unit
```

---

## 7. generation.service.ts — createDraft (120 satır)

```
Dosya: apps/api/src/modules/generation/generation.service.ts
Fonksiyon: createDraft (satır 598): 120 satır

Refactor kuralları:
- Validasyon, AI çağrısı ve DB yazma adımlarını ayrı helper'lara böl.
- Max 80 satır. Mevcut API'yi değiştirme.

Doğrulama: pnpm lint -- apps/api/src/modules/generation/generation.service.ts && pnpm --filter @growth-os/api test:unit
```

---

## 8. x-integration — x-client.ts (constructor complexity 18) + x-integration.service.ts (completeConnect 120 satır)

```
Dosyalar:
  - apps/api/src/modules/x_integration/x-client.ts — Constructor (satır 177): complexity 18
  - apps/api/src/modules/x_integration/x-integration.service.ts — completeConnect (satır 80): 120 satır

Refactor kuralları:
- x-client constructor'daki branching'i config validation helper'a taşı.
- completeConnect'i: validateCallback, exchangeToken, persistConnection adımlarına böl.
- Her fonksiyon max 80 satır, complexity ≤15.

Doğrulama: pnpm lint -- apps/api/src/modules/x_integration/ && pnpm --filter @growth-os/api test:unit
```

---

## 9. billing.service.ts — monthlyUsage (5 parametre) + logger.ts — log (5 parametre)

```
Dosyalar:
  - apps/api/src/modules/billing/billing.service.ts — monthlyUsage (satır 72): 5 parametre
  - packages/shared/src/observability/logger.ts — log (satır 41): 5 parametre

Refactor kuralları:
- monthlyUsage: parametreleri options object'e dönüştür → monthlyUsage(opts: MonthlyUsageParams)
- logger.log: parametreleri options object'e dönüştür → log(opts: LogParams)
- Tüm call-site'ları güncelle (grep ile bul).
- max-params: 4 kuralına uy.

Doğrulama: pnpm lint -- apps/api/src/modules/billing/ packages/shared/src/observability/ && pnpm typecheck
```

---

## 10. Web UI bileşenleri — LoginPage, StudioHero, StudioRightRail, Views

```
Dosyalar:
  - apps/web/app/login/page.tsx — LoginPage: 149 satır
  - apps/web/components/studio/hero.tsx — StudioHero: 98 satır
  - apps/web/components/studio/right-rail.tsx — StudioRightRail: 91 satır
  - apps/web/components/studio/views/analytics-view.tsx — AnalyticsView: 147 satır, complexity 18
  - apps/web/components/studio/views/dashboard-view.tsx — DashboardView: 92 satır, complexity 17
  - apps/web/components/studio/views/generator-view.tsx — GeneratorView: 166 satır, complexity 17
  - apps/web/components/studio/views/settings-view.tsx — SettingsView: 151 satır

Refactor kuralları:
- Her bileşeni daha küçük alt bileşenlere böl. JSX bloklarını <SectionName /> bileşenlerine extract et.
- Conditional rendering zincirlerini (complexity ihlali) ayrı bileşenlere veya early return'lere dönüştür.
- Her fonksiyon/bileşen max 80 satır, complexity ≤15.
- Alt bileşenler aynı dosyada kalabilir veya aynı dizinde ayrı dosyada olabilir.
- Mevcut props API'lerini değiştirme.

Doğrulama: pnpm lint -- apps/web/ && pnpm --filter @growth-os/web build
```

---

## 11. seed.ts — main (91 satır)

```
Dosya: apps/api/src/shared/db/seed.ts
Fonksiyon: main (satır 8): 91 satır

Refactor kuralları:
- Seed adımlarını ayrı fonksiyonlara böl: seedUsers, seedWorkspaces, seedContent vb.
- main() bu fonksiyonları sırayla çağırsın. Max 80 satır.

Doğrulama: pnpm lint -- apps/api/src/shared/db/seed.ts && pnpm --filter @growth-os/api db:seed
```

---

## 12. E2E mock server — server.mjs (complexity 19)

```
Dosya: apps/web/e2e/mock-api/server.mjs
Arrow function (satır 67): complexity 19

Refactor kuralları:
- Route handler'daki büyük switch/if bloğunu route-specific handler fonksiyonlarına böl.
- Her handler max complexity 15. Ana router sadece dispatch yapsın.

Doğrulama: pnpm lint -- apps/web/e2e/mock-api/server.mjs
```

---

## 13. Test dosyaları (5 ihlal)

```
Dosyalar:
  - apps/api/src/modules/analytics/tests/analytics.getSnapshots.integration.test.ts (133 satır)
  - apps/api/src/modules/auth/tests/auth.sessionGuard.workspaceIsolation.integration.test.ts (158 satır)
  - apps/api/src/modules/generation/tests/generation.createDraftVersion.integration.test.ts (105 satır)
  - apps/api/src/modules/scheduling/tests/scheduling.publishNow.safeModeAndDedupe.integration.test.ts (130 satır)
  - apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts (122 satır)

Refactor kuralları:
- Büyük describe/it bloklarını daha küçük describe bloklarına böl.
- Ortak setup'ı beforeEach veya helper fonksiyonlara taşı.
- Test utility fonksiyonlarını (factory, builder) dosya başına veya __helpers__ dizinine çıkar.
- Her test callback max 80 satır.
- Test davranışını değiştirme, sadece yapısal refactor.

Doğrulama: pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration
```

---

## Çalıştırma Sırası

1. **#9** (params — en kolay, geniş etki alanı)
2. **#5** (error mapping — küçük, bağımsız)
3. **#11** (seed — küçük)
4. **#12** (mock server — küçük)
5. **#6** (better-auth config)
6. **#7** (generation createDraft)
7. **#8** (x-integration)
8. **#4** (scheduling)
9. **#13** (test dosyaları)
10. **#10** (web UI bileşenleri)
11. **#3** (session-auth guard — CRITICAL)
12. **#2** (useStudioController — CRITICAL)
13. **#1** (processPublishJob — CRITICAL, en büyük)
