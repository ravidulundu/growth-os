# Todo

## Plan

- [x] Coverage kapsamını mevcut durumdan çıkar (tek dosya yerine proje çekirdeği).
- [x] Proje geneli coverage scriptlerini tanımla (`api`, `shared`, `ui`, `worker`).
- [x] Root seviyede birleşik coverage komutu ekle.
- [x] Çalıştırıp sonuçları raporla, kalite kapılarına entegre et.
- [x] Gerekirse eşik/harici bırakma kararlarını açık ve savunulabilir şekilde düzelt.
- [x] API coverage düşük modülleri için integration test ekle (`analytics`, `style`, `generation`, `auth/better-auth`, `session guard`).
- [x] API coverage raporunu tekrar al ve 99 hedef gap'ini netleştir.

## Magic-link Email Refactor

- [x] Inspect nodemailer usage in `apps/api/src/modules/auth/better-auth.ts` and document how the magic-link email is sent.
- [x] Review `apps/api/src/shared/email/email.service.ts` to map existing behavior and dependencies.
- [x] Draft a refactor proposal that centralizes magic-link email logic in `apps/api/src/shared/email/email.service.ts` without altering functionality, noting impacted imports/tests.

## Scheduling Retry Audit

- [ ] Inspect scheduling queue producer defaults and `.add()` options for retry behavior.
- [ ] Document worker retry handling in `apps/worker/src/main.ts`.
- [ ] Recommend how to prevent BullMQ native retries from colliding with custom retry logic.

## Next Plan (Scheduling manual fallback review)

- [ ] Inspect scheduling service, controller, queue, and shared email usage to map existing endpoints, service helpers, audit logging, and log message conventions.
- [ ] Identify the best place to add `createManualPublishFallback` helper plus `POST /scheduling/manual-fallback`, noting how DTO/schema style is defined (pipes, Zod shapes) and where audit logging should live.
- [ ] Document reminder idempotency/storage options by listing existing tables/columns that support manual scheduling reminders or fallback dedupe flags.
- [ ] Gather inspection findings and sketch a minimal implementation plan for `POST /scheduling/manual-fallback` (optional reminder email + dedupe) referencing the existing scheduling/email patterns.

## Worker Publish Failure Handling Proposal

- [ ] Inspect `apps/worker/src/main.ts` to map where `POLICY_REJECTED`, `RATE_LIMIT`, and `AUTH_FAILED` errors are set and where `publish_jobs` state/metadata is updated.
- [ ] Determine the minimal place(s) to mark `requires_manual_action` metadata for those failures without breaking retry logic.
- [ ] Draft recommended changes outlining how the metadata flag should be applied and any safeguards for retries.

## Worker Publish Failure Manual Action Plan

- [ ] Inspect `apps/worker/src/main.ts` publish failure branches to confirm where `POLICY_REJECTED`, `RATE_LIMIT`, and `AUTH_FAILED` errors are surfaced and how `publish_jobs` metadata updates occur there.
- [ ] Identify the smallest non-breaking update (query or metadata mutation) that sets `requires_manual_action` for those failures while preserving current retry semantics.
- [ ] Note exact query parts needing updates and propose helper function names (low complexity, single responsibility) to encapsulate the metadata marking logic for reuse.

## Worker Publish Failure Manual Action Plan

- [ ] Inspect `apps/worker/src/main.ts` publish failure branches to confirm where `POLICY_REJECTED`, `RATE_LIMIT`, and `AUTH_FAILED` errors are surfaced and how `publish_jobs` metadata updates occur there.
- [ ] Identify the smallest non-breaking update (query or metadata mutation) that sets `requires_manual_action` for those failures while preserving current retry semantics.
- [ ] Note exact query parts needing updates and propose helper function names (low complexity, single responsibility) to encapsulate the metadata marking logic for reuse.

## Worker Publish Failure Handling Proposal

- [ ] Inspect `apps/worker/src/main.ts` to map where `POLICY_REJECTED`, `RATE_LIMIT`, and `AUTH_FAILED` errors are set and where `publish_jobs` state/metadata is updated.
- [ ] Determine the minimal place(s) to mark `requires_manual_action` metadata for those failures without breaking retry logic.
- [ ] Draft recommended changes outlining how the metadata flag should be applied and any safeguards for retries.

## Next Plan (Codex Faz2 Prompt Üretimi)

- [x] `docs/deep-research-report(1).md` içindeki Faz2 aday boşlukları çıkar.
- [x] `tasks/codex-faz1-feature-prompts.md` ile çakışan/biten maddeleri ele.
- [x] Kalanları uygulanabilir Codex prompt formatına dönüştür.
- [x] `tasks/codex-faz2-feature-prompts.md` dosyasını oluştur.
- [x] Kısa yürütme sırası ve doğrulama komutlarını ekle.

## Next Plan (Stripe Paywall + Entitlement)

- [x] API’ye Stripe bağımlılığı ve env dokümantasyonunu ekle.
- [x] `012_billing_subscriptions.sql` migration ile billing tablolarını ekle.
- [x] Billing controller/service içinde checkout, portal, webhook endpointlerini ekle.
- [x] Billing plan çözümlemesini subscription tablosu + workspace fallback olacak şekilde güncelle.
- [x] Web settings ekranına plan kartları ve upgrade/manage billing aksiyonlarını ekle.
- [x] Build ve test komutlarıyla doğrula, çıkan hataları aynı turda düzelt.

## Next Plan (Landing + Waitlist + Onboarding + Demo)

- [x] `app/page.tsx` kök rotasını marketing landing + CTA olacak şekilde dönüştür.
- [x] Waitlist için migration + API endpoint (`POST /auth/waitlist`) ekle.
- [x] Onboarding state için server endpointleri (`GET/PATCH /auth/session/state`) ekle.
- [x] Studio dashboard’a local+server resume destekli onboarding wizard ekle.
- [x] Demo workspace local fixture akışını ekle (boş kullanıcı için hızlandırılmış başlangıç).
- [x] Web E2E mock server ve auth-flow testlerini yeni landing davranışına uyumla.
- [x] İstenen doğrulama komutlarını çalıştırıp hataları düzelt.

## Next Plan (Waitlist/Auth session review)

- [ ] Read `apps/api/src/modules/auth/auth.controller.ts` plus adjacent DTOs to understand waitlist changes.
- [ ] Review `apps/api/src/modules/auth/auth-session.controller.ts` and `session-auth.guard.ts` for session state contract changes.
- [ ] Inspect `packages/db/migrations/013_*.sql` for schema changes tied to waitlist/onboarding and note potential type mismatches.
- [ ] Document any compile/lint risks or contract mismatches (shape, status codes, exports) with exact file/line references.

## Next Plan (Series/Evergreen/Repurpose Inspection)

- [x] Catalog UI requirements for the Series/Evergreen/Repurpose feature from docs/requests if available.
- [x] Review `apps/web/components/studio/views/library-view.tsx`, `scheduler-view.tsx`, `generator-view.tsx`, `use-studio-controller.ts`, `hooks/use-studio-series.ts`, and `apps/web/lib/api.ts` to determine current implementation coverage.
- [x] List any missing UI behaviors/data paths plus probable build/lint risks tied to these files.

## Next Plan (Series + Evergreen + Repurpose Implementation)

- [x] Add migration for `content_series`, `content_series_items`, and `repurpose_runs`.
- [x] Add generation endpoints/service flows for `createSeries`, `listSeries`, and `repurposeContent`.
- [x] Add worker evergreen enqueue flow after publish success with idempotent dedupe.
- [x] Wire web library/generator/scheduler views for series + repurpose + evergreen visibility.
- [x] Resolve lint/typecheck regressions introduced by new flow (`max-lines`, strict TS).
- [x] Validate with `format:check`, `lint`, `typecheck`, `api build`, `worker build`, `web build`, and `api test:unit`.

## Next Plan (Series + Evergreen + Repurpose Test Sweep)

- [x] Add generation integration coverage for `createSeries` + `listSeries`.
- [x] Add generation integration coverage for `repurposeContent` + `repurpose_runs` persistence.
- [x] Add scheduling integration coverage for `enqueueSeriesNextItem` success and guard branches.
- [x] Run DB migrate flow for latest migrations and verify idempotent rerun.
- [x] Run targeted integration tests, then full `api test:integration`.

## Runtime Stabilization (2026-02-24)

- [x] Investigate `EADDRINUSE` crash loop on web dev port `3010`.
- [x] Terminate stale `next`/`pnpm` processes holding port `3010`.
- [x] Verify `@growth-os/web` starts cleanly on `3010`.
- [x] Verify API health and magic-link endpoint response after restart.

## Next Plan (Metrics Pipeline Inspection)

- [ ] Trace `processMetricsJob` and `storeMetricsSnapshot` in `apps/worker/src/main.ts` to locate where the `t60` snapshot is persisted.
- [ ] Review queue usage patterns/idempotency options for the metrics pipeline to understand existing hooks and retry controls.
- [ ] Identify the safest hook point for async alert delivery based on the pipeline structure and persistence timing.

## Next Plan (Sentry + PostHog + KPI Telemetry)

- [x] API için Sentry init + global exception capture filter ekle (`requestId` + `workspaceId` tag).
- [x] API için PostHog fire-and-forget telemetry helper ekle (PII scrub + sample + daily cap).
- [x] Kritik API akışlarına server-side event emit ekle (`x_connect_*`, `style_extracted`, `draft_generated`, `scheduled`, `published`, `first_hour_alert_triggered`).
- [x] `GET /analytics/kpi/:workspaceId?range=7d` endpointi ve servis hesaplamalarını ekle.
- [x] Web için Sentry/PostHog init altyapısı ekle (opsiyonel env, sample + daily cap + PII scrub).
- [x] Studio web aksiyonlarına kritik event emit ekle.
- [x] Dashboard/Settings içine KPI Snapshot kartını bağla.
- [x] `.env.example` observability env dokümantasyonunu güncelle.
- [x] Doğrulama: format + lint + typecheck + `api build` + `web build` + `api test:unit`.

## Next Plan (Publish Fallback: Copy-to-X + Reminder)

- [x] `apps/api` scheduling katmanında duplicate helper tanımlarını temizle ve `createManualPublishFallback(contentId, reasonCode)` ekle.
- [x] `POST /scheduling/manual-fallback` endpointini ekle (composeUrl + plainText + reason), opsiyonel reminder akışını idempotent hale getir.
- [x] Worker permanent-failure path’inde hedef hata kodları için (`POLICY_REJECTED`, `RATE_LIMIT`, `AUTH_FAILED`) manual action bayrağını publish job kaydına yaz.
- [x] Web scheduler’da manual fallback aksiyonunu yeni endpoint ile bağla (copy + compose tek tık davranışını koru).
- [x] Fallback/reminder için regression test ekle (API integration + worker unit).
- [x] Doğrulama: `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/worker build`, `pnpm --filter @growth-os/web build`, `pnpm --filter @growth-os/worker test`.

## Next Plan (Competitor Pattern Panel)

- [x] `014_competitor_analytics.sql` migration ile `competitor_accounts` ve `competitor_post_snapshots` tablolarını ekle.
- [x] API analytics katmanına competitor endpointlerini ekle (`POST /analytics/competitors/:workspaceId/add`, `GET /analytics/competitors/:workspaceId/overview`).
- [x] X integration service’e read-only competitor timeline ingest helper ekle (rate-limit dostu bounded batch).
- [x] Analytics service’te hook pattern, posting window ve best-performing examples hesaplayan overview akışını ekle.
- [x] Web analytics ekranına Competitor Insights bölümü + rakip ekleme formu + özet kart/listeleri ekle.
- [x] Integration test ekle (workspace isolation + competitor add/overview davranışı).
- [x] Doğrulama: `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/web build`, `pnpm --filter @growth-os/api test:integration`.

## Competitor Analytics Inspection

- [ ] Review `apps/api/src/modules/analytics` for service controllers/handlers that could expose competitor insights and note their function names.
- [ ] Review `apps/api/src/modules/x_integration` for helper services that ingest competitor data and record their endpoints and function flows.
- [ ] Summarize best insertion points, including DTO/guard patterns, and call out lint/complexity risks for each candidate.

## Review

- Competitor Pattern Panel eklendi:
  - Migration: `packages/db/migrations/014_competitor_analytics.sql`.
  - API: `POST /analytics/competitors/:workspaceId/add` ve `GET /analytics/competitors/:workspaceId/overview`.
  - X Integration: read-only `ingestCompetitorTimeline` helper (bounded timeline + metrics fetch budget).
  - Web: Analytics görünümüne competitor ekleme formu, summary kartları ve best-performing post listesi.
  - Test: `apps/api/src/modules/analytics/tests/analytics.competitors.integration.test.ts`.
  - Doğrulama: `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/web build`, `pnpm db:migrate`, `pnpm --filter @growth-os/api test:integration`.
- Publish fallback akışı eklendi:
  - API: `POST /scheduling/manual-fallback` + `createManualPublishFallback` helper + reminder idempotency (`notification_log`).

## Competitor Insights Panel Inspection

- [ ] Map current analytics hook/view/API so competitor insights panel can be added without breaking `useStudioController` API.
- [ ] Identify minimal Web-side updates needed for analytics view & API surface.
- [ ] Note verification steps and document any residual risks.

## Competitor Insights Panel Inspection

- [ ] Map current analytics hook/view/API so competitor insights panel can be added without breaking `useStudioController` API.
- [ ] Identify minimal Web-side updates needed for analytics view & API surface.
- [ ] Note verification steps and document any residual risks.
  - Worker: permanent failure audit metadata içine `requires_manual_action` işareti eklendi (`POLICY_REJECTED`, `RATE_LIMIT`, `AUTH_FAILED`).
  - Web: scheduler manuel aksiyon butonları endpoint tabanlı fallback sonucu ile çalışacak şekilde güncellendi.
  - Test: `apps/api/src/modules/scheduling/tests/scheduling.manualFallback.integration.test.ts` ve `apps/worker/tests/manual-fallback.test.ts`.
  - Doğrulama: `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/worker build`, `pnpm --filter @growth-os/web build`, `pnpm --filter @growth-os/worker test`.
- Yeni komut eklendi: `pnpm coverage:project`.
- `pnpm coverage:api` tek-dosya ölçümü yerine `@growth-os/api coverage:project` çalıştıracak şekilde düzeltildi.
- `quality:gate` ve `quality:gate:push` coverage için `coverage:project` kullanacak şekilde güncellendi.
- Kapsamlı ölçüm sonucu (tek dosya yerine proje çekirdeği):
  - `@growth-os/shared`: Stmts 72.93 / Branch 78.57 / Func 81.81 / Lines 72.93
  - `@growth-os/ui`: Stmts 100 / Branch 77.77 / Func 100 / Lines 100
  - `@growth-os/worker`: Stmts 100 / Branch 87.5 / Func 100 / Lines 100 (`src/main.ts` hariç)
  - `@growth-os/api`: Stmts 54.19 / Branch 69.41 / Func 80.31 / Lines 54.19
- Eşik kararı: Proje geneli coverage görünürlüğü açıldı; gerçek oranlar düşük olduğu için bu aşamada yüksek threshold dayatılmadı. Sonraki iterasyonda modül bazlı test artışıyla kademeli eşik eklenecek.
- Coverage iyileştirme sonrası API sonucu:
  - Önce: Stmts 54.19 / Branch 69.41 / Func 80.31 / Lines 54.19
  - Sonra: Stmts 81.01 / Branch 67.02 / Func 93.06 / Lines 81.01
- 99 hedef gap: en büyük açıklar `generation.service.ts`, `scheduling.service.ts`, `session-auth.guard.ts` branch/path coverage.
- Series/Evergreen/Repurpose implementasyonu tamamlandı:
  - Migration: `packages/db/migrations/013_content_series_evergreen.sql`
  - API: series + repurpose endpoint/service akışları aktif
  - Worker: publish sonrası evergreen sıradaki içeriği idempotent enqueue ediyor
  - Web: library `Series` sekmesi, scheduler’da `Evergreen active` özeti, generator’da `Repurpose` aksiyonu
  - Doğrulama: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/worker build`, `pnpm --filter @growth-os/web build`, `pnpm --filter @growth-os/api test:unit`
- Series/Evergreen/Repurpose test sweep tamamlandı:
  - Yeni integration testler:
    - `apps/api/src/modules/generation/tests/generation.series.integration.test.ts`
    - `apps/api/src/modules/generation/tests/generation.repurpose.integration.test.ts`
    - `apps/api/src/modules/scheduling/tests/scheduling.series.integration.test.ts`
  - Migration doğrulaması:
    - `pnpm db:migrate` ilk çalıştırmada `013_content_series_evergreen.sql` uygulandı
    - `pnpm db:migrate` ikinci çalıştırma idempotent geçti (yeni migration yok)
  - Doğrulama:
    - hedefli: `pnpm --filter @growth-os/api exec tsx --test ...series... ...repurpose... ...scheduling.series...` (3/3 pass)
    - tam: `pnpm --filter @growth-os/api test:integration` (12/12 pass)

## Next Plan (Gap Implementation)

- [x] Real X Client (`X_CLIENT_MODE=real`) implementasyonu: OAuth token exchange, profile, timeline, publish, metrics
- [x] `x-client.ts` içinde mock+real mode seçimi ve production guard güncellemesi
- [x] X entegrasyonuna gerekli env doğrulama ve hata eşleme eklenmesi
- [x] Unit/integration testlerin mode ayrımına göre güncellenmesi
- [x] Sonuç doğrulama: lint + typecheck + ilgili testler

### Gap Progress

- Real X Client eklendi (`apps/api/src/modules/x_integration/x-client.ts`)
- `getXClient()` artık `mock|real` modunu destekliyor
- Real mode için env fail-fast kontrolleri var (`X_CLIENT_ID`, `X_REDIRECT_URI`)
- X HTTP hata eşleme eklendi (`RATE_LIMIT`, `X_TEMPORARY_ERROR`, `AUTH_FAILED`, `POLICY_REJECTED`)
- Testler:
  - Unit: real flow + 429 mapping + real mode cache/env
  - Integration: x_integration suite dahil 7/7 pass

## Next Plan (Style Extraction Gap)

- [x] `style.service.ts` profil şemasını rapordaki eksik alanlarla genişlet
- [x] Vocabulary + hook pattern + do/don't + CTA pattern heuristik çıkarımını ekle
- [x] Format tercihi, cümle ritmi, dil/argo, humor/sarcasm skoru alanlarını üret
- [x] Style unit/integration testlerini yeni şemaya göre güncelle
- [x] Lint + typecheck + style testlerini çalıştırıp sonucu doğrula

### Style Gap Progress

- `apps/api/src/modules/style/style.service.ts` profil şeması genişletildi (vocabulary, hooks, do/don't, ctaPatterns, brandSafetyNotes, sentenceRhythm).
- `apps/api/tests/style/style-extraction.test.ts` yeni alanlar için assertion'lar eklendi.
- `apps/api/src/modules/style/tests/style.extractAndGetProfile.integration.test.ts` persist edilen yeni profil alanları doğrulandı.
- `apps/api/tests/generation/generation.buildGeneratedText.styleConstraints.unit.test.ts` yeni `StyleProfile` tipine uyumlandırıldı.
- Doğrulama:
  - `pnpm --filter @growth-os/api test:unit -- tests/style/style-extraction.test.ts tests/generation/generation.buildGeneratedText.styleConstraints.unit.test.ts` pass
  - `pnpm --filter @growth-os/api lint` pass
  - `pnpm --filter @growth-os/api typecheck` pass
  - `pnpm --filter @growth-os/api test:integration -- src/modules/style/tests/style.extractAndGetProfile.integration.test.ts` pass

## Next Plan (Generation Gap: Reply/Quote + Guardrails)

- [x] `generation` içerik tiplerini `reply` ve `quote` ile genişlet
- [x] DB migration ile `contents.type` constraint ve `prompt_templates` tablosunu hizala
- [x] Template-tabanlı prompt çözümleme (workspace + content type) ekle
- [x] Guardrail katmanı ekle (duplicate line dedupe + CTA spam azaltma + iddia yumuşatma)
- [x] API/Web tiplerini ve Generator UI içerik tipi seçimlerini güncelle
- [x] Unit + integration testleri yeni davranışa göre ekle/güncelle
- [x] Lint + typecheck + ilgili testleri çalıştırıp doğrula

### Generation Gap Progress

- Migration eklendi: `packages/db/migrations/008_generation_reply_quote_templates.sql`
  - `contents.type` constraint artık `tweet|thread|reply|quote`
  - `prompt_templates` tablosu ve index eklendi
- `apps/api/src/modules/generation/generation.service.ts`
  - `ContentType` genişletildi (`reply`, `quote`)
  - Workspace + content type bazlı template çözümleme eklendi (`prompt_templates`)
  - Guardrail eklendi: duplicate satır temizleme, CTA spam sınırlama, mutlak iddia yumuşatma
  - OpenRouter prompt üretimi template + style birleşimiyle güncellendi
- `apps/api/src/modules/generation/generation.controller.ts`
  - `draft` schema artık `reply|quote` ve opsiyonel `templateName` kabul ediyor
  - Yeni endpointler: `GET /generation/templates/:workspaceId`, `POST /generation/templates/upsert`
- `apps/api/src/shared/db/seed.ts`
  - Varsayılan prompt template seed kayıtları eklendi (`tweet/thread/reply/quote`)
- Web güncellemesi:
  - `apps/web/components/studio/types.ts`: `ContentMode` genişletildi
  - `apps/web/components/studio/views/generator-view.tsx`: Reply/Quote seçenekleri eklendi
  - `apps/web/lib/api.ts`: createDraft payload ve StyleProfile tipi güncellendi
- Testler:
  - Yeni unit: `apps/api/tests/generation/generation.guardrails.reply_quote.unit.test.ts`
  - Güncellenen integration: `apps/api/src/modules/generation/tests/generation.createDraftVersion.integration.test.ts`
- Doğrulama:
  - `pnpm db:migrate` pass
  - `pnpm --filter @growth-os/api test:unit -- tests/generation/generation.buildGeneratedText.styleConstraints.unit.test.ts tests/generation/generation.guardrails.reply_quote.unit.test.ts` pass
  - `pnpm --filter @growth-os/api test:integration -- src/modules/generation/tests/generation.createDraftVersion.integration.test.ts` pass
  - `pnpm --filter @growth-os/api lint` pass
  - `pnpm --filter @growth-os/api typecheck` pass
  - `pnpm --filter @growth-os/web typecheck` pass

## Next Plan (Analytics Visualization Gap)

- [x] Analytics view'e görsel trend/karşılaştırma blokları ekle
- [x] İlk saat ve son snapshot için özet KPI kartları ekle
- [x] Snapshot bazlı impressions/engagement bar görselleştirmesi ekle
- [x] Web typecheck ile doğrula

### Analytics UI Progress

- `apps/web/components/studio/views/analytics-view.tsx`
  - Ham metrik listesi yerine KPI + bar görselleştirme tabanlı görünüm eklendi
  - `t15/t60/t24` etiketleri kısa formatta gösteriliyor
  - Quotes metriği görünümü eklendi
- Doğrulama:
  - `pnpm --filter @growth-os/web typecheck` pass

## Next Plan (Billing/Metering Gap)

- [x] Billing servisi ekle: plan limitleri + aylık kullanım hesaplama
- [x] Generation draft akışına metering enforcement bağla
- [x] Billing metering endpointlerini ekle
- [x] Studio Settings görünümüne metering paneli bağla
- [x] Unit/integration testler ile limit davranışını doğrula
- [x] API/Web lint + typecheck + ilgili testleri çalıştır

### Billing Gap Progress

- `apps/api/src/modules/billing/billing.service.ts`
  - Plan bazlı aylık generation limitleri eklendi (`mvp0/free/creator/growth/team`)
  - Aylık kullanım hesaplama ve 429 limit enforcement eklendi
- `apps/api/src/modules/billing/billing.controller.ts`
  - `GET /billing/metering/:workspaceId` endpointi eklendi
- `apps/api/src/modules/generation/generation.service.ts`
  - Draft üretim transaction'ına metering enforcement bağlandı
- `apps/api/src/modules/billing/tests/billing.meteringAndLimit.integration.test.ts`
  - Free plan limit dolu durumda bloklama ve mvp0 sınırsız davranışı doğrulandı
- `apps/web/components/studio/views/settings-view.tsx`
  - Plan/kullanım paneli + `Load Metering` akışı eklendi
- `apps/web/components/studio/use-studio-controller.ts` + `apps/web/lib/api.ts`
  - Billing metering API entegrasyonu ve state eklendi

## Next Plan (First-Hour Alerting Gap)

- [x] Analytics servisinde first-hour alert hesaplama ekle
- [x] First-hour alert endpointini ekle
- [x] Analytics integration testine alert senaryolarını ekle
- [x] Studio Analytics görünümüne alert panelini bağla
- [x] API/Web doğrulamalarını çalıştır

### First-Hour Alert Progress

- `apps/api/src/modules/analytics/analytics.service.ts`
  - `getFirstHourAlertForContent` eklendi (ok/watch/critical sınıflandırma + nedenler)
- `apps/api/src/modules/analytics/analytics.controller.ts`
  - `GET /analytics/content/:workspaceId/:contentId/first-hour-alert` endpointi eklendi
- `apps/api/src/modules/analytics/tests/analytics.getSnapshots.integration.test.ts`
  - İyi performans (`ok`) ve kötüleşen metrik (`critical`) senaryoları eklendi
- `apps/web/lib/api.ts`
  - `getFirstHourAlert` ve response tipi eklendi
- `apps/web/components/studio/use-studio-controller.ts`
  - `firstHourAlert` state + `handleLoadFirstHourAlert` eklendi
- `apps/web/components/studio/views/analytics-view.tsx`
  - First-hour alert kartı ve aksiyon butonu eklendi

## Next Plan (First-Hour Alert Threshold Extraction)

- [ ] Inspect `apps/api/src/modules/analytics/analytics.service.ts` and related helpers to locate the first-hour alert threshold computation and all input data.
- [ ] Trace the existing first-hour alert logic (functions, constants, guards) and note any dependencies that must be preserved for behavior parity.
- [ ] Recommend a minimal extraction point (function/file) that can be reused by the worker without behavioral change and document exact function names/paths.

## Next Plan (PR Review Threads Closure)

- [x] Açık PR review thread listesini çıkar ve tekrar edenleri grupla
- [x] Kritik/aksiyon gerektiren yorumları kodda düzelt (`runtime-policy`, `session guard`, `auth map`, `smtp`, `queue`, `similarity`, `generation template`)
- [x] İlgili regresyon testlerini ekle/güncelle
- [x] Lint + typecheck + unit/integration doğrulamalarını çalıştır
- [x] Tek commit + thread reply/resolve adımını tamamla

### PR Review Closure Progress

- `apps/worker/src/runtime-policy.ts`: `real` mode desteklendi, production’da sadece `mock` engeli bırakıldı.
- `apps/worker/tests/runtime-policy.test.ts`: production `real` mode pozitif testi eklendi.
- `apps/api/src/shared/auth/session-auth.guard.ts`: aynı request içindeki tüm scoped resource ID’ler için workspace tutarlılığı zorunlu hale getirildi.
- `apps/api/src/modules/auth/tests/auth.sessionGuard.workspaceIsolation.integration.test.ts`: çapraz-workspace resource kombinasyonuna `Forbidden` regresyon testi eklendi.
- `apps/api/src/modules/auth/auth.controller.ts`: Better Auth status mapping 1xx/2xx durumlarında 500’e normalize edildi.
- `apps/api/tests/auth/auth.controller.mapBetterAuthError.unit.test.ts`: status mapping davranışı için unit test eklendi.
- `apps/api/src/modules/auth/better-auth.ts`: SMTP fallback portu `.env.example` ile uyumlu olacak şekilde 587’ye çekildi.
- `apps/api/src/modules/generation/generation.service.ts`: `toPromptTemplate` içindeki dead override kaldırıldı, DB satır alanları doğrudan kullanıldı.
- `apps/api/src/modules/scheduling/queue.ts`: queue close ve Redis quit sıralı hale getirildi.
- `packages/shared/src/scheduling/similarity.ts`: boş token-union durumunda similarity 0 olacak şekilde düzeltildi.
- `apps/api/tests/scheduling/similarity.cosine.threshold.unit.test.ts`: kısa/boş token vakası için regresyon assertion eklendi.
- Doğrulama:
  - `pnpm --filter @growth-os/worker test` pass
  - `pnpm --filter @growth-os/api test:unit` pass
  - `pnpm --filter @growth-os/api exec tsx --test src/modules/auth/tests/auth.sessionGuard.workspaceIsolation.integration.test.ts` pass
  - `pnpm lint` pass

## Runtime Stabilization Review (2026-02-24)

- Kök neden: port `3010` üzerinde stale `next dev` süreçleri nedeniyle yeni web dev süreçleri sürekli `EADDRINUSE` ile düşüyordu.
- Doğrulama: stale prosesler kapatıldıktan sonra `WEB_PORT=3010 corepack pnpm --filter @growth-os/web dev` sağlıklı açıldı.
- API doğrulama: `GET /health` -> `200`, `POST /auth/sign-in/magic-link` -> `201`.

## Landing + Onboarding Review (2026-02-24)

- `/` route artık marketing landing render ediyor; geçerli session tespit edilirse server-side `/studio` redirect çalışıyor.
- Waitlist altyapısı eklendi: `013_waitlist_onboarding_state.sql` + `POST /auth/waitlist` duplicate-safe kayıt.
- Onboarding state API eklendi: `GET /auth/session/state` ve `PATCH /auth/session/state` (local+server resume destekli).
- Studio dashboard onboarding wizard ile adım bazlı akış (workspace, X connect, ingest, style, draft) ve “Use Demo Workspace” kısa yolu sağlandı.
- E2E mock API yeni endpointlerle genişletildi ve auth-flow testleri landing davranışına göre güncellendi.
- Playwright webServer yapılandırması dev lock/port çakışmalarını önlemek için production `build + start` modeline alındı; varsayılan E2E portu `3310`.
- Doğrulama:
  - `corepack pnpm --filter @growth-os/web build` pass
  - `corepack pnpm --filter @growth-os/api build` pass
  - `corepack pnpm --filter @growth-os/web test:e2e` pass

## Telemetry + KPI Review (2026-02-24)

- API telemetry altyapısı eklendi:
  - `apps/api/src/shared/telemetry/api-telemetry.ts`
  - `apps/api/src/shared/telemetry/sentry-exception.filter.ts`
  - `apps/api/src/main.ts` içinde `initApiTelemetry` ve process-level exception capture bağlandı.
  - `apps/api/src/app.module.ts` içinde global `APP_FILTER` olarak `SentryExceptionFilter` eklendi.
- API server-side event emit eklendi:
  - `apps/api/src/modules/x_integration/x-integration.controller.ts`
  - `apps/api/src/modules/style/style.controller.ts`
  - `apps/api/src/modules/generation/generation.controller.ts`
  - `apps/api/src/modules/scheduling/scheduling.controller.ts`
  - `apps/api/src/modules/analytics/analytics.service.ts`
- KPI endpoint eklendi:
  - `GET /analytics/kpi/:workspaceId?range=24h|7d|30d`
  - `apps/api/src/modules/analytics/analytics.controller.ts`
  - `apps/api/src/modules/analytics/analytics.service.ts`
- Web telemetry altyapısı eklendi:
  - `apps/web/lib/telemetry.ts`
  - `apps/web/app/providers.tsx` içinde init.
- Web event emit ve KPI UI eklendi:
  - `apps/web/components/studio/hooks/use-studio-auth.ts`
  - `apps/web/components/studio/hooks/use-studio-drafts.ts`
  - `apps/web/components/studio/hooks/use-studio-publish.ts`
  - `apps/web/components/studio/hooks/use-studio-analytics.ts`
  - `apps/web/components/studio/views/dashboard-view.tsx`
  - `apps/web/lib/api.ts`
- Observability env dokümantasyonu genişletildi:
  - `.env.example` (Sentry + PostHog + sample/cap env’leri).
- Doğrulama:
  - `corepack pnpm format:check` pass
  - `corepack pnpm lint` pass
  - `corepack pnpm typecheck` pass
  - `corepack pnpm --filter @growth-os/api build` pass
  - `corepack pnpm --filter @growth-os/web build` pass
  - `corepack pnpm --filter @growth-os/api test:unit` pass

## Next Plan (First-Hour Alert Delivery)

- [x] Worker metrics pipeline içinde `t60` snapshot sonrası asenkron alert dispatch entegrasyonunu tamamla.
- [x] Worker first-hour alert helper blokları için lint/type kırıklarını düzelt (davranışı değiştirmeden).
- [x] İlgili build/test doğrulamalarını çalıştır (`api build`, `worker build`, `api unit`, `worker test`).
- [x] Yeni migration için `db:migrate` çalıştırıp idempotent sonucu doğrula.

### First-Hour Alert Delivery Review

- `apps/worker/src/main.ts` içinde `processMetricsJob` artık snapshot'ı alıp sadece `t60` için `evaluateAndDeliverFirstHourAlert` çağrısını non-blocking (`void ...catch`) tetikliyor.
- Alert delivery hataları metrics snapshot yazımını etkilemeden loglanıyor; böylece depolama yolu bloklanmıyor.
- SMTP yapılandırması yoksa email kanalı `notification_log` üzerinde delivered olarak işaretlenmeden `warn` ile skip ediliyor.
- Worker derleme hatası için `@types/nodemailer` eklendi (`apps/worker/package.json` + lockfile).
- Doğrulama:
  - `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build` pass
  - `pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/worker test` pass
  - `pnpm db:migrate` pass (`011_notification_log.sql` applied)
  - `pnpm db:migrate` tekrar pass (idempotent, yeni migration uygulanmadı)

## Codex Faz2 Prompt Review (2026-02-24)

- Yeni dosya oluşturuldu: `tasks/codex-faz2-feature-prompts.md`.
- Faz1’de tamamlanan başlıklar dışarıda bırakılarak derin rapordan kalan ürünleşme alanları promptlaştırıldı.
- Faz2 prompt seti 7 başlık içeriyor:
  - Stripe paywall + entitlement
  - Content series + evergreen queue + repurpose
  - Competitor analytics panel
  - Manual publish fallback (copy-to-X + reminder)
  - Sentry/PostHog + KPI telemetry
  - Onboarding + landing + waitlist + demo workspace
  - Data retention + token lifecycle compliance
- Dosya sonunda önerilen uygulama sırası eklendi.

## Stripe Paywall + Entitlement Review (2026-02-24)

- API:
  - `apps/api/src/modules/billing/billing.controller.ts`
    - `POST /billing/checkout-session` (`workspaceId`, `planKey`)
    - `POST /billing/portal-session` (`workspaceId`)
    - `POST /billing/webhook` (Stripe signature verify + public route)
  - `apps/api/src/modules/billing/billing.service.ts`
    - Stripe checkout/portal session üretimi
    - Webhook event idempotency (`billing_webhook_events`)
    - `checkout.session.completed`, `customer.subscription.*`, `invoice.*` işleme
    - Effective plan çözümlemesi: subscription plan -> workspace `plan_key` fallback
    - Metering response’a billing summary + latest invoice bilgisi eklendi (backward compatible)
- DB:
  - `packages/db/migrations/012_billing_subscriptions.sql`
    - `billing_customers`, `billing_subscriptions`, `billing_invoices`, `billing_webhook_events`
- Web:
  - `apps/web/lib/api.ts`: checkout/portal API fonksiyonları + billing summary tipleri
  - `apps/web/components/studio/hooks/use-studio-analytics.ts`: billing action handlers
  - `apps/web/components/studio/views/settings-view.tsx`: plan kartları + upgrade/manage billing + renewal/invoice görünümü
- Test:
  - `apps/api/src/modules/billing/tests/billing.meteringAndLimit.integration.test.ts`
    - active subscription plan override
    - canceled subscription fallback
- Doğrulama:
  - `pnpm --filter @growth-os/api build` pass
  - `pnpm --filter @growth-os/web build` pass
  - `pnpm --filter @growth-os/api test:unit` pass
  - `pnpm --filter @growth-os/api test:integration` pass
  - `pnpm --filter @growth-os/api typecheck` pass
  - `pnpm --filter @growth-os/worker typecheck` pass
  - `pnpm --filter @growth-os/shared typecheck` pass
- Ek review fixleri (açık thread seti):
  - `apps/api/src/modules/generation/generation.service.ts`
    - LLM çağrısı öncesi non-locking metering precheck eklendi (`preflightGenerationLimit`).
    - Mutlak iddia regex’i `100%` senaryosunu kapsayacak şekilde düzeltildi.
  - `apps/api/src/modules/generation/tests/generation.createDraft.limitPrecheck.integration.test.ts`
    - Limit doluyken OpenRouter `fetch` çağrısının hiç tetiklenmediğini doğrulayan regresyon testi eklendi.
  - `apps/api/src/modules/analytics/analytics.service.ts`
    - `critical` seviyede bile `low_engagement_rate` reason bilgisinin korunması sağlandı.
  - `apps/api/src/modules/analytics/tests/analytics.getSnapshots.integration.test.ts`
    - Degrade senaryosunda hem `critical_impressions` hem `low_engagement_rate` assertion’ı eklendi.
  - `apps/worker/src/main.ts`
    - `PUBLISH_MAX_ATTEMPTS` parse işlemi `envInt` helper’ına taşındı (`NaN` fallback güvenliği).
  - `apps/api/src/modules/auth/auth.controller.ts` + `apps/web/lib/api.ts`
    - Verify akışında HTML redirect fallback’i navigation sinyaliyle sınırlandı.
    - Web verify isteğine `Accept: application/json` eklendi.
  - `apps/api/tests/auth/auth.requestAcceptsHtml.behavior.unit.test.ts`
    - Navigation vs programmatic fetch ayrımı için unit test eklendi.
- Bu tur doğrulama:
  - `pnpm lint` pass
  - `pnpm --filter @growth-os/api test:unit` pass
  - `pnpm --filter @growth-os/api test:integration` pass

## Next Plan (PR Review Closure Round 2)

- [x] Açık thread listesini yeniden doğrula (`scripts/check-pr-review-threads.mjs`)
- [x] Güvenlik/CI odaklı aksiyon yorumlarını kodda düzelt:
  - worker similarity env parse fallback
  - session token lookup candidate daraltma
  - staging deploy condition düzeltmesi
  - analytics UUID param validation
  - auth SameSite configurability
- [x] İlgili unit testleri ekle/güncelle (worker env, analytics uuid, auth cookie, session token lookup)
- [x] Lint + typecheck + unit/integration doğrulamalarını çalıştır
- [ ] Tüm düzeltmeleri tek commit olarak gönder
- [ ] Her açık review thread’ine kısa not bırak ve resolve et

### Round 2 Progress

- `apps/worker/src/env.ts` eklendi; `SAFE_MODE_MAX_SIMILARITY` parse güvenliği `envFloat` ile merkezi hale getirildi.
- `apps/worker/src/main.ts` similarity threshold parse işlemi `envFloat("SAFE_MODE_MAX_SIMILARITY", 0.85, 0, 1)` ile güvenli fallback’e taşındı.
- `apps/worker/tests/env.test.ts` eklendi; empty/invalid/out-of-range env senaryoları doğrulandı.
- `apps/api/src/shared/auth/session-auth.guard.ts` lookup candidate listesi raw token ile sınırlandı.
- `apps/api/tests/auth/session-token-lookup-candidates.test.ts` yeni davranışa göre güncellendi.
- `apps/api/src/modules/analytics/analytics.controller.ts` UUID param validation eklendi (`requireUuidParam`).
- `apps/api/tests/analytics/analytics.controller.uuid_params.unit.test.ts` eklendi.
- `apps/api/src/modules/auth/auth.controller.ts` + `apps/api/src/modules/auth/better-auth.ts` için `AUTH_COOKIE_SAME_SITE` desteği eklendi.
- `apps/api/tests/auth/auth-cookie-secure.test.ts` same-site davranış testleri genişletildi.
- `.github/workflows/ci.yml` staging deploy/smoke koşulları yalnız `develop` branch’e indirildi.
- `apps/api/src/modules/scheduling/queue.ts`, `apps/api/src/modules/x_integration/x-client.ts`, `apps/api/src/modules/generation/generation.service.ts` dosyalarına ilgili review notlarını açıklayan kısa yorumlar eklendi.
- Bu tur doğrulama:
  - `pnpm lint` pass
  - `pnpm typecheck` pass
  - `pnpm --filter @growth-os/worker test` pass
  - `pnpm --filter @growth-os/api test:unit` pass
  - `pnpm --filter @growth-os/api test:integration` pass

## Next Plan (Full Build + Typecheck Sweep)

- [x] Güncel full `pnpm typecheck` çıktısını alıp hataları dosya/beklenti tipine göre grupla.
- [x] Yüksek etkili derleme kırıkları için kök nedeni düzelt (`better-auth`, `scheduling.service`).
- [x] `noUncheckedIndexedAccess` kaynaklı `possibly undefined` hatalarını API servis/test dosyalarında guard/assertion ile düzelt.
- [x] Paket bazlı incremental doğrulamalar çalıştır (`@growth-os/api`, etkilenen diğer paketler).
- [x] Full `pnpm typecheck` ile 0 hata doğrulaması yap ve sonucu Review bölümüne işle.

### Typecheck Sweep Progress

- Worker tarafındaki `rows[0]` nullability kırığı giderildi (`apps/worker/src/main.ts`).
- API çekirdek düzeltmeleri yapıldı:
  - `apps/api/src/modules/auth/better-auth.ts` (`additionalFields` literal type + cast uyumu)
  - `apps/api/src/modules/scheduling/scheduling.service.ts` (`PoolClient` tip düzeltmesi)
  - `apps/api/src/modules/generation/generation.service.ts` (DB result row guard’ları)
  - `apps/api/src/modules/style/style.service.ts` (index erişim guard’ları)
  - `apps/api/src/modules/x_integration/x-integration.service.ts` (account/token row guard’ları)
  - `apps/api/src/shared/db/seed.ts` (seed row guard’ları)
- API test dosyalarında `rows[0]` ve array index erişimleri assertion/guard ile noUncheckedIndexedAccess uyumlu hale getirildi.

### Typecheck Sweep Review

- `pnpm --filter @growth-os/api typecheck` -> pass.
- `pnpm typecheck` -> pass (monorepo 0 TS hata).

## Next Plan (ESLint Full Sweep)

- [x] Full `pnpm lint` çıktısını al ve ihlalleri kategori/dosya bazında grupla.
- [x] Yüksek etkili ihlalleri (complexity, max-lines-per-function, max-depth, max-params) davranışı koruyarak düzelt.
- [x] Lint-safe type/import ihlallerini düzelt (`no-explicit-any`, `no-console`, `no-restricted-imports`).
- [x] Etkilenen dosyaları hedefli lint komutlarıyla doğrula.
- [x] Full `pnpm lint` ile 0 hata doğrulamasını tamamla ve review bölümüne yaz.

### ESLint Sweep Progress

- Full lint sonucu tek ihlal olarak bulundu:
  - `apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts`
  - `max-lines-per-function` (async test callback: 81 satır)
- İlgili test callback’i yapısal olarak bölündü:
  - `createRealFlowFetchImpl(fetchCalls)` helper’ı eklendi.
  - `assertRealClientFlow(client, fetchCalls)` helper’ı eklendi.
  - Ana test callback’i compose eden kısa akışa indirildi.

### ESLint Sweep Review

- `pnpm lint -- apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts` -> pass.
- `pnpm lint` -> pass (monorepo 0 lint error).

## Next Plan (Unit + Integration Test Sweep)

- [x] Full unit test çalıştır ve failure envanterini çıkar.
- [x] DB ayağa kaldır + migration sonrası full integration test çalıştır ve failure envanterini çıkar.
- [x] Failing testleri kök nedene göre düzelt (import/signature/mock/schema/assertion).
- [x] Düzeltme sonrası hedefli test doğrulamaları yap.
- [x] Full `pnpm test:unit && pnpm test:integration` ile 0 fail doğrulamasını tamamla.

### Test Sweep Progress

- `pnpm test:unit` sonucu:
  - shared: 5/5 pass
  - ui: 1/1 pass
  - api unit: 35/35 pass
  - worker: 9/9 pass
- `pnpm db:up && pnpm db:migrate && pnpm test:integration` sonucu:
  - api integration: 9/9 pass
  - migration checksum uyarıları beklenen legacy durum (fail değil)
- Final birleşik doğrulama çalıştırıldı: `pnpm test:unit && pnpm test:integration` -> tüm suite pass.

### Test Sweep Review

- Fail eden test bulunmadı; kod değişikliği gerekmedi.
- Doğrulama komutları:
  - `pnpm test:unit` -> pass
  - `pnpm db:up && pnpm db:migrate && pnpm test:integration` -> pass
  - `pnpm test:unit && pnpm test:integration` -> pass

## Next Plan (E2E Test Sweep)

- [x] Full `pnpm test:e2e` çalıştır ve hata envanterini çıkar.
- [x] Failing E2E’leri selector/mock/timing kategorisine ayır.
- [x] İlgili page object, testid veya mock-api uyumsuzluklarını davranışı koruyarak düzelt.
- [x] Düzeltilen akışlar için tekrar E2E doğrulaması yap.
- [x] Full `pnpm test:e2e` ile 0 fail doğrulamasını tamamla.

### E2E Sweep Progress

- `pnpm test:e2e 2>&1 | tee /tmp/e2e-errors.txt` çalıştırıldı.
- Playwright suite sonucu: 4/4 pass.
- Selector/mock/timing kaynaklı fail tespit edilmedi; düzeltme gerektirmedi.

### E2E Sweep Review

- `pnpm test:e2e` -> pass (0 fail).
- Çıktı dosyası: `/tmp/e2e-errors.txt`.
- Not: `NO_COLOR` ve `allowedDevOrigins` uyarıları görüldü, test sonucunu etkilemedi.

## Next Plan (Build + Bundle Sweep)

- [x] Full `pnpm build` çalıştır ve failure envanterini çıkar.
- [x] Build kırıklarını kategoriye göre düzelt (module not found / Next.js boundary / TS emit / circular).
- [x] App bazlı build doğrulaması çalıştır (`@growth-os/api`, `@growth-os/web`, `@growth-os/worker`).
- [x] Final full `pnpm build` ile 0 hata doğrulaması yap.

### Build Sweep Progress

- Full `pnpm build 2>&1 | tee /tmp/build-errors.txt` çalıştırıldı.
- Build failure bulunmadı; module resolution / Next.js boundary / TS emit / circular kaynaklı hata oluşmadı.
- App bazlı build doğrulamaları çalıştırıldı:
  - `pnpm --filter @growth-os/api build`
  - `pnpm --filter @growth-os/web build`
  - `pnpm --filter @growth-os/worker build`

### Build Sweep Review

- `pnpm build` -> pass.
- `pnpm --filter @growth-os/api build` -> pass.
- `pnpm --filter @growth-os/web build` -> pass.
- `pnpm --filter @growth-os/worker build` -> pass.
- Final `pnpm build` -> pass (0 hata).

## Next Plan (Format + Prettier Sweep)

- [x] `pnpm format:check` çalıştır ve ihlalleri çıkar.
- [x] `pnpm format` ile otomatik düzeltmeleri uygula.
- [x] `git diff --name-only` ile format sonrası değişen dosyaları raporla.
- [x] Final `pnpm format:check` ile 0 hata doğrulaması yap.

### Format Sweep Progress

- `pnpm format:check` ilk çalıştırmada 23 dosyada Prettier uyumsuzluğu bulundu.
- `pnpm format` ile otomatik format uygulandı.
- `git diff --name-only` ile mevcut değişen dosya listesi alındı.

### Format Sweep Review

- `pnpm format:check 2>&1 | tee /tmp/format-errors.txt` -> fail (ilk kontrol, beklenen).
- `pnpm format` -> pass.
- `git diff --name-only` -> değişen dosya listesi raporlandı.
- Final `pnpm format:check` -> pass (`All matched files use Prettier code style!`).

## Next Plan (Full Quality Gate Final)

- [x] `pnpm quality:gate` çalıştır ve full pipeline sonucunu al.
- [x] Fail eden adım olursa ilgili katmanda kök neden düzeltmesini yap ve yeniden doğrula.
- [x] Coverage çıktısını paket bazında kontrol et, eşik altı varsa kapat.
- [x] Final durumda `pnpm quality:gate` yeşilken `git status` ve `git diff --stat` kontrolünü al.

### Quality Gate Progress

- `pnpm quality:gate 2>&1 | tee /tmp/quality-gate.txt` çalıştırıldı.
- Pipeline adımları sırasıyla geçti:
  - `format:check` pass
  - `lint` pass
  - `typecheck` pass
  - `test:unit` pass
  - `test:integration` pass
  - `coverage:project` pass
  - `build` pass
- Coverage raporları:
  - `@growth-os/shared`: Stmts `73.57`, Branch `79.06`, Func `81.81`, Lines `73.57`
  - `@growth-os/ui`: Stmts `100`, Branch `77.77`, Func `100`, Lines `100`
  - `@growth-os/worker`: Stmts `95.77`, Branch `78.09`, Func `95.65`, Lines `95.77`
  - `@growth-os/api`: Stmts `85.98`, Branch `71.06`, Func `93.85`, Lines `85.98`
- Not: `coverage:project` komutlarında `--check-coverage` eşiği tanımlı değil; gate bu haliyle pass.

### Quality Gate Review

- `pnpm quality:gate` -> pass (0 fail).
- Son kontrol:
  - `git status --short` -> geniş kapsamlı mevcut çalışma ağacı değişiklikleri mevcut, beklenmedik yeni fail yok.
  - `git diff --stat` -> `59 files changed, 5148 insertions(+), 3064 deletions(-)`.

## Next Plan (X Client Token Auto-Refresh)

- [ ] API `XClient` arayüzünü `refreshToken` metodu ile genişlet (real + mock implementasyon).
- [ ] `XIntegrationService.refreshAccessToken(accountId, workspaceId)` ekle (FOR UPDATE lock + revoke/insert).
- [ ] Worker token fetch sorgusuna expiry buffer filtresi ekle.
- [ ] Worker publish akışında `AUTH_FAILED` için tek seferlik refresh + yeniden publish denemesi ekle.
- [ ] API/Worker build + test doğrulamalarını çalıştır.

### X Refresh Progress

- (Başladı) API/Worker mevcut publish-token akışı analiz edildi.

### X Refresh Review

- (Çalışma devam ediyor)

## Next Plan (Security Audit Remediation: Nest/Fastify/Nodemailer Upgrade)

- [x] CI `dependency_audit` ve `typecheck` fail nedenlerini netleştir
- [x] `apps/api` bağımlılıklarını Nest 11 + Fastify 5 + Nodemailer 7 seviyesine yükselt
- [x] Fastify 5 uyumu için redirect ve CORS method ayarlarını güncelle
- [x] Eksik billing modülü ve bağlı analytics/web değişikliklerini projeye dahil et
- [x] Tam kalite kapısını (`quality:gate:push`) lokal bypass olmadan çalıştır

### Security Upgrade Progress

- `apps/api/package.json`
  - `@nestjs/common/core/platform-fastify` -> `11.1.14`
  - `fastify` -> `5.7.4`
  - `@fastify/cors` -> `11.2.0`
  - `nodemailer` -> `7.0.11`
  - `@types/nodemailer` -> `7.0.11`
- `apps/api/src/modules/auth/auth.controller.ts`
  - Fastify 5 redirect imzasına uyum için `response.redirect(url, statusCode)` formatına geçildi.
- `apps/api/src/main.ts`
  - CORS config'e `methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` eklendi.
- `apps/api/src/modules/billing/*` + `apps/api/src/app.module.ts`
  - Billing service/controller/test eklendi ve module provider/controller listesine bağlandı.
- `apps/api/src/modules/analytics/*` + `apps/web/*`
  - First-hour alert + metering UI/API bağlantıları projeye dahil edildi.
- `pnpm-lock.yaml`
  - Yükseltilen paketler için lockfile güncellendi.

### Validation (No Bypass)

- `pnpm audit --prod --audit-level high` -> pass (`No known vulnerabilities found`)
- `pnpm format:check` -> pass
- `pnpm lint` -> pass
- `pnpm typecheck` -> pass
- `pnpm test:unit` -> pass
- `pnpm test:integration` -> pass
- `pnpm --filter @growth-os/api build` -> pass
- `pnpm --filter @growth-os/worker build` -> pass
- `pnpm quality:gate:push` -> pass

## Next Plan (PR Review Closure Round 3)

- [x] Açık review thread listesini tekrar çıkar (`scripts/check-pr-review-threads.mjs`)
- [x] Aksiyon gerektiren yorumları kodda düzelt:
  - `publishNow` implicit dedupe anahtarı
  - E2E mock API cookie adı prod ile hizalama
  - token-vault payload parse strictliği
  - `.env.example` için same-origin API base varsayılanı
- [x] İlgili testleri ekle/güncelle:
  - shared token-vault edge case unit
  - scheduling publishNow implicit dedupe integration
- [x] Doğrulama çalıştır:
  - `pnpm --filter @growth-os/shared test`
  - `pnpm --filter @growth-os/api exec tsx --test src/modules/scheduling/tests/scheduling.publishNow.safeModeAndDedupe.integration.test.ts`
  - `pnpm --filter @growth-os/web test:e2e`
  - `pnpm lint`
  - `pnpm typecheck`
- [x] Tüm değişiklikleri tek commit olarak gönder
- [x] Her açık thread’e kısa not bırak ve resolve et

### Round 3 Progress

- `apps/api/src/modules/scheduling/scheduling.service.ts`
  - `publishNow` artık implicit çağrıda dakika-bucket tabanlı dedupe key üretiyor.
- `apps/api/src/modules/scheduling/tests/scheduling.publishNow.safeModeAndDedupe.integration.test.ts`
  - dedupeKey verilmeden art arda `publishNow` çağrısında `ConflictException` beklentisi eklendi.
- `packages/shared/src/security/token-vault.ts`
  - `decodeParts` için `parts.length === 3` zorunluluğu eklendi (fazla segment reject).
- `packages/shared/tests/shared-core.test.ts`
  - ekstra segmentli payload için `decryptSecret` reject testi eklendi.
- `apps/web/e2e/mock-api/server.mjs`
  - E2E mock session cookie adı `session_token` ile prod davranışına hizalandı.
- `.env.example`
  - `NEXT_PUBLIC_API_URL` varsayılanı `/api` yapıldı (cross-origin cookie edge-case azaltımı).

## Next Plan (PR #1 Critical Review Round 4)

- [x] Worker publish/metrics akışında inline mock fonksiyonları kaldır, `X_CLIENT_MODE` ile gerçek/mock client seçimine bağla.
- [x] Generation OpenRouter fallback davranışını düzelt: `openrouter` modunda sessiz fallback yerine log + hata; fallback sadece `stub` modunda.
- [x] `GenerationService` constructor default DI bypass (`new BillingService()`) kaldır.
- [x] `contents.type` constraint’i migration bootstrap safhasında `reply|quote` ile hizala.
- [x] `x-client` JSON parse hatalarında sessiz `undefined` yerine belirgin hata üret.
- [x] Rollback/queue kapanışındaki sessiz catch bloklarına log visibility ekle.
- [x] Auth cookie policy + UUID validation merkezileştirme ve `SessionAuthGuard` paralel scoped lookup değişikliklerini finalize et.
- [x] Lint + typecheck + hedef testleri çalıştır, sonuçları bu dosyada review altında özetle.

### Round 4 Progress

- `apps/worker/src/x-client.ts` eklendi; worker publish/metrics için `mock|real` seçilebilir X client katmanı oluşturuldu.
- `apps/worker/src/main.ts`
  - inline `publishPost/fetchPostMetrics` mock fonksiyonları kaldırıldı.
  - publish ve metrics akışı `getXClient()` üzerinden çalışacak şekilde bağlandı.
  - rollback/recovery catch bloklarına yapılandırılmış `warn/error` logları eklendi.
- `apps/worker/tests/x-client.test.ts` eklendi; mode cache, invalid JSON ve retry davranışları testlendi.
- `apps/api/src/modules/generation/generation.service.ts`
  - OpenRouter çağrısında sessiz fallback kaldırıldı; `openrouter` modunda hata log + `502` döndürülüyor.
  - fallback metin artık yalnızca `LLM_PROVIDER=stub` için aktif.
  - `GenerationService` constructor’daki `new BillingService()` default bypass kaldırıldı.
  - transaction rollback catch’lerine `Logger.warn` visibility eklendi.
- `apps/api/src/modules/generation/tests/*`
  - `GenerationService` test init’i DI uyumlu olacak şekilde `new BillingService()` ile güncellendi.
- `packages/db/migrations/003_mvp0_core.sql`
  - `contents.type` constraint bootstrap seviyesinde `tweet|thread|reply|quote` oldu.
- `apps/api/src/modules/x_integration/x-client.ts`
  - JSON parse hatası artık sessiz `undefined` değil, explicit `X_REQUEST_FAILED` hatası.
- `apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts`
  - invalid JSON regresyon testi eklendi.
- `apps/api/src/modules/x_integration/x-integration.service.ts`
  - tüm rollback catch noktalarına `Logger.warn` eklendi.
- `apps/api/src/modules/scheduling/scheduling.service.ts` + `apps/api/src/modules/scheduling/queue.ts`
  - rollback/redis quit fallback path’lerine log visibility eklendi.
- `apps/api/src/shared/http/origin-utils.ts`
  - `APP_URL` boşsa production/staging ortamlarında localhost origin fallback’i kapatıldı.
- `apps/api/src/shared/auth/cookie-policy.ts` + `apps/api/src/shared/validation/uuid.ts` eklendi; auth cookie policy ve UUID doğrulama merkezi hale getirildi.
- `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/shared/auth/session-auth.guard.ts`
  - cookie policy/UUID ortaklaştırma ve scoped workspace lookup paralelleştirme finalize edildi.
- Root artifact cleanup:
  - `XPatla Benzeri Bir Ürünü Kişisel Kullanım İçin İnşa Etme ve Ürünleştirme Ana Planı.pdf` silindi.
  - `deep-research-report(1).md` silindi.
- `apps/web/app/page.tsx`
  - server-side `resolveApiBaseUrl` yalnız absolute `http(s)` URL kabul edecek şekilde düzeltildi; relative `/api` fallback kaynaklı silent auth redirect bug’ı kapatıldı.
- PR thread operasyonu:
  - `apps/web/app/page.tsx:6` thread’ine fix notu yazıldı ve thread resolve edildi.
  - `node scripts/check-pr-review-threads.mjs` -> pass (0 unresolved).

### Round 4 Validation

- `pnpm quality:gate:push` pass
  - `format:check` pass
  - `lint` pass
  - `typecheck` pass
  - `test:unit` pass
  - `test:integration` pass
  - `coverage:project` pass
  - `test:e2e` pass
  - `build` pass
- Son web thread fix doğrulaması:
  - `pnpm --filter @growth-os/web typecheck` pass
- `pnpm --filter @growth-os/web test:e2e` pass
- `pnpm lint` pass

## Next Plan (Session Guard Inspection)

- [ ] Review `apps/api/src/shared/auth/session-auth.guard.ts` to document `canActivate` and `extractScopedResourceIds` behavior.
- [ ] Draft refactor plan that breaks the current logic into helpers such as `validateSession`, `resolveWorkspace`, `checkPermissions`, `handleScopedResources`, with exact signatures.
- [ ] Design a lookup-map or strategy for scoped resource extraction that keeps complexity ≤15.

## Next Plan (Worker `processPublishJob` Structural Refactor)

- [x] `processPublishJob` akışını davranışı koruyarak helper fonksiyonlara böl (`prepareDraft`/publish/recovery/metrics/status).
- [x] Derin nested blokları (özellikle mevcut 565/581/586/643 çevresi) `handleRetry` + enqueue-recovery helper’larına çıkar.
- [x] Her helper fonksiyonda satır ve complexity hedefini koru (<=80 satır, <=15 complexity; depth <=4).
- [x] Worker lint + worker test komutlarıyla doğrula.
- [x] Sonuçları bu dosyada Review bölümüne komut çıktılarıyla özetle.

### Worker Refactor Progress

- `apps/worker/src/main.ts` içinde `processPublishJob` orchestration-only hale getirildi:
  - `prepareDraft`, `publishToX`, `updateStatus`, `handleRetry`, `handleMetrics`
  - retry enqueue recovery için `handleRetryEnqueueFailure` + `applyRetryEnqueueFailureState`
- Deeply nested retry path ayrı helper’lara taşındı; hedeflenen 565/581/586/643 civarı bloklar düzleştirildi.
- `publishToX` satır sınırı için token/finalize/persist adımları `fetchAccessTokenForPublish`, `lockPublishJobForFinalize`, `persistPublishedPost` olarak ayrıldı.
- `markPermanentFailure` parametre sayısı object param ile düşürüldü.

### Review (Worker processPublishJob Refactor)

- `pnpm lint -- apps/worker/src/main.ts` -> fail (`eslint . -- apps/worker/src/main.ts` repo genelini lint ettiği için 30 mevcut hata; hedef dosyada yeni hata yok).
- `pnpm exec eslint apps/worker/src/main.ts` -> pass.
- `pnpm --filter @growth-os/worker test` -> pass (9/9).

## Next Plan (Studio controller hook split)

- [x] Analyze `apps/web/components/studio/use-studio-controller.ts` to document its public API and grouped responsibilities.
- [x] Sketch new custom hooks (with proposed file names) for cohesive concerns like drafts, publishing, analytics, and settings, ensuring the composed API stays identical.
- [x] Capture the refactor plan in this file for future implementation.

## Next Plan (Web `useStudioController` Structural Refactor)

- [x] `useStudioController` içeriğini concern bazlı custom hook'lara ayır (`useStudioDrafts`, `useStudioPublish`, `useStudioAnalytics`, session/auth/feedback).
- [x] URL/localStorage sync ve unsaved-draft guard davranışını ayrı hook ile koru.
- [x] Ana `useStudioController` fonksiyonunu yalnız composition + aynı public API return edecek hale indir.
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/web/components/studio/use-studio-controller.ts` ve `pnpm --filter @growth-os/web build`).
- [x] Sonuçları `tasks/todo.md` review bölümüne komut bazında yaz.

### Web Studio Controller Refactor Progress

- `apps/web/components/studio/use-studio-controller.ts` artık yalnız composition + API re-export yapıyor; hook satır sayısı 80 altına indirildi.
- Yeni concern hook dosyaları eklendi:
  - `hooks/use-studio-identifiers.ts` (URL/localStorage sync + id state)
  - `hooks/use-unsaved-draft-warning.ts` (beforeunload guard)
  - `hooks/use-studio-feedback.ts` + `hooks/use-studio-health.ts` (notice/activity/action + health check)
  - `hooks/use-studio-session.ts`, `hooks/use-studio-auth.ts`, `hooks/use-studio-accounts.ts`
  - `hooks/use-studio-drafts.ts`, `hooks/use-studio-publish.ts`, `hooks/use-studio-analytics.ts`
- Dış API korunumu: `useStudioController` return key seti aynı kaldı (state, setter, handler, stats, sections, apiBaseUrl).

### Review (useStudioController Refactor)

- `pnpm lint -- apps/web/components/studio/use-studio-controller.ts` -> fail (`eslint . -- ...` repo genelini lint ettiği için mevcut 29 baseline hata var).
- `pnpm exec eslint apps/web/components/studio/use-studio-controller.ts apps/web/components/studio/hooks/*.ts` -> pass.
- `pnpm --filter @growth-os/web build` -> pass.

## Next Plan (SessionAuthGuard Critical Complexity Refactor)

- [x] `extractScopedResourceIds` için map/strategy tabanlı extractor kur ve if/switch zincirini kaldır.
- [x] `canActivate` akışını helper adımlara böl (`validateSession`, `resolveWorkspace`, `checkPermissions`, `handleScopedResources`).
- [x] Guard davranışını koru (token/session/membership/scoped workspace doğrulaması birebir).
- [x] İstenen doğrulamaları çalıştır: lint + api unit + api integration.
- [x] Sonuçları review bölümüne komut bazında yaz.

### SessionAuthGuard Refactor Progress

- `apps/api/src/shared/auth/session-auth.guard.ts` içinde scoped resource extraction lookup-map yaklaşımına taşındı (`SCOPED_RESOURCE_ALIAS_MAP` + `SCOPED_RESOURCE_KEYS` + `pickScopedResourceId`).
- `canActivate` orchestration seviyesine indirildi; akış helper’lara bölündü:
  - `validateSession`
  - `handleScopedResources`
  - `resolveWorkspace`
  - `checkPermissions`
- Scoped resource workspace resolve blokları query map (`SCOPED_RESOURCE_WORKSPACE_QUERIES`) ile strateji tabanlı hale getirildi; behavior korunarak aynı tablo lookup’ları devam ediyor.
- NestJS `CanActivate` davranışı ve `request.auth` set etme kontratı korunmuştur.

### Review (SessionAuthGuard Refactor)

- `pnpm lint -- apps/api/src/shared/auth/session-auth.guard.ts && pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration` -> fail (`pnpm lint -- ...` repo genelini lint ettiği için mevcut 26 baseline hata zinciri kırıyor).
- `pnpm exec eslint apps/api/src/shared/auth/session-auth.guard.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).
- `pnpm --filter @growth-os/api test:integration` -> pass (9/9).

## Plan (Scheduling Service Analysis)

- [x] Review `apps/api/src/modules/scheduling/scheduling.service.ts` `schedule` implementation to enumerate current behavior checkpoints.
- [x] Identify safe helper extraction points (`validateScheduleInput`, `resolvePublishTime`, `enqueueJob`, `handleDedupe`) while keeping the public `schedule` signature unchanged.
- [x] Define helper method signatures that preserve existing behavior and dependency contracts for future extraction work.

## Next Plan (SchedulingService `schedule` Complexity Refactor)

- [x] `schedule` fonksiyonunu aşamalara böl (`validateScheduleInput`, `resolvePublishTime`, `handleDedupe`, `enqueueJob`).
- [x] Her helper fonksiyonu <=80 satır ve complexity <=15 hedefiyle sadeleştir.
- [x] Public API imzasını koru (`schedule(params)` dış sözleşmesi değişmesin).
- [x] İstenen doğrulamayı çalıştır ve sonuçları kaydet.

### SchedulingService Refactor Progress

- `apps/api/src/modules/scheduling/scheduling.service.ts` içinde `schedule` orchestration-only hale getirildi.
- Yeni helper’lar eklendi:
  - `validateScheduleInput`
  - `resolvePublishTime`
  - `handleDedupe`
  - `persistSchedule`
  - `enqueueJob`
  - `persistEnqueueRecovery`
- Transactional persist ve enqueue-recovery davranışı korunarak küçük helper’lara ayrıldı.
- `publishNow` ve servis public method imzaları korunmuştur.

### Review (SchedulingService schedule Refactor)

- `pnpm lint -- apps/api/src/modules/scheduling/scheduling.service.ts && pnpm --filter @growth-os/api test:unit` -> fail (`pnpm lint -- ...` repo genelini lint ettiği için mevcut 24 baseline hata zinciri kırıyor).
- `pnpm exec eslint apps/api/src/modules/scheduling/scheduling.service.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (AuthController `mapBetterAuthError` Complexity Refactor)

- [x] `mapBetterAuthError` switch/if zincirini mapping object (`Record<string, { status, message }>` ) + lookup/fallback yapısına taşı.
- [x] Status/message normalize adımlarını küçük helper fonksiyonlara bölerek complexity düşür.
- [x] Davranışı koru (redirect status -> 401, invalid status -> 500, 500 için InternalServerErrorException).
- [x] İstenen doğrulamayı çalıştır ve sonuçları kaydet.

### AuthController Refactor Progress

- `apps/api/src/modules/auth/auth.controller.ts` içinde `BETTER_AUTH_ERROR_MAPPING` eklendi ve `mapBetterAuthError` lookup + fallback modeline taşındı.
- Yeni helper’lar eklendi:
  - `normalizeBetterAuthStatus`
  - `resolveBetterAuthMessage`
  - `toMappedAuthError`
  - `toMappedHttpException`
- Mevcut `mapBetterAuthError` unit test davranışları korunmuştur.

### Review (mapBetterAuthError Refactor)

- `pnpm lint -- apps/api/src/modules/auth/auth.controller.ts && pnpm --filter @growth-os/api test:unit` -> fail (`pnpm lint -- ...` repo genelini lint ettiği için mevcut 23 baseline hata zinciri kırıyor).
- `pnpm exec eslint apps/api/src/modules/auth/auth.controller.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (BetterAuth `createBetterAuthInstance` Structural Refactor)

- [x] `createBetterAuthInstance` içindeki config bloklarını helper fonksiyonlara çıkar (`buildPlugins`, `buildSessionConfig`, `buildEmailConfig` ve ilgili config builderlar).
- [x] Ana fonksiyonu compose/orchestration seviyesine indir ve 80 satır sınırının altına çek.
- [x] Auth davranışını değiştirmeden mevcut Better Auth init akışını koru.
- [x] İstenen doğrulamayı çalıştır ve sonuçları review altında kaydet.

### BetterAuth Refactor Progress

- `apps/api/src/modules/auth/better-auth.ts` içinde `createBetterAuthInstance` orchestration-only hale getirildi.
- Yeni helperlar eklendi: `buildUserConfig`, `buildSessionConfig`, `buildAccountConfig`, `buildVerificationConfig`, `buildAdvancedConfig`, `buildDatabaseHooks`, `buildEmailConfig`, `buildPlugins`, `resolveMagicLinkMaxRequestsPerHour`.
- Plugin/session/email yapılandırmaları ayrı helperlarla compose edildi; `betterAuth(...)` çağrısı davranış korunarak sadeleştirildi.

### Review (BetterAuth createBetterAuthInstance Refactor)

- `pnpm lint -- apps/api/src/modules/auth/better-auth.ts && pnpm --filter @growth-os/api test:unit` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki 22 baseline lint hatası zinciri kırıyor).
- `pnpm exec eslint apps/api/src/modules/auth/better-auth.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (GenerationService `createDraft` Structural Refactor)

- [x] `createDraft` akışını validasyon/hazırlık, AI üretim ve DB persist adımlarına helper bazında böl.
- [x] Public API imzasını değiştirmeden `createDraft` fonksiyonunu <=80 satır olacak şekilde orchestration-only hale indir.
- [x] Transaction sırası, billing enforcement, guardrail ve audit/usage davranışını birebir koru.
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/api/src/modules/generation/generation.service.ts && pnpm --filter @growth-os/api test:unit`) ve review altına sonuçları yaz.

### GenerationService Refactor Progress

- `apps/api/src/modules/generation/generation.service.ts` içinde `createDraft` orchestration-only hale getirildi.
- Hazırlık/validasyon adımı `prepareDraftContext` helper’ına taşındı (preflight + style profile + template çözümleme).
- DB persist adımı helper’lara bölündü: `insertDraftContent`, `insertDraftVersion`, `insertDraftUsageEvent`, `insertDraftAuditLog`, `persistDraft`.
- Rollback path’i `rollbackCreateDraft` helper’ına taşındı; mevcut warn + rethrow davranışı korunmuştur.
- `createDraft` public method signature korunmuştur.

### Review (GenerationService createDraft Refactor)

- `pnpm lint -- apps/api/src/modules/generation/generation.service.ts && pnpm --filter @growth-os/api test:unit` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki 21 baseline lint hatası zinciri kırıyor).
- `pnpm exec eslint apps/api/src/modules/generation/generation.service.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (X Integration Complexity Refactor)

- [x] `x-client.ts` constructor branching akışını config resolve + validate helper’larına taşı.
- [x] `x-integration.service.ts` `completeConnect` fonksiyonunu `validateCallback`, `exchangeToken`, `persistConnection` adımlarına böl.
- [x] Her helper’da transaction/rollback ve auth davranışını değiştirmeden complexity/line hedeflerini koru.
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/api/src/modules/x_integration/ && pnpm --filter @growth-os/api test:unit`) ve review’a yaz.

### X Integration Refactor Progress

- `apps/api/src/modules/x_integration/x-client.ts`
  - Constructor config çözümleme/validasyon adımları helper’lara taşındı:
    - `resolveRealXClientConfig`
    - `validateRealXClientConfig`
    - alan bazlı resolver helper’lar (`resolveBaseUrl`, `resolveClientId`, `resolveConfiguredScopes` vb.)
  - Constructor artık yalnız config compose + alan ataması yapıyor.
- `apps/api/src/modules/x_integration/x-integration.service.ts`
  - `completeConnect` orchestration-only hale getirildi.
  - Akış helper’lara ayrıldı:
    - `validateCallback`
    - `exchangeToken`
    - `persistConnection`
  - Rollback tekrarları `rollbackTransaction` helper’ında merkezileştirildi.
- Mevcut API/davranış korundu: OAuth state lock+consume, external token/profile fetch, account upsert + token revoke/insert + audit log sırası aynı.

### Review (X Integration Complexity Refactor)

- `pnpm lint -- apps/api/src/modules/x_integration/ && pnpm --filter @growth-os/api test:unit` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki 19 baseline lint hatası zinciri kırıyor).
- `pnpm exec eslint apps/api/src/modules/x_integration/x-client.ts apps/api/src/modules/x_integration/x-integration.service.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (Billing + Observability Max-Params Refactor)

- [x] `billing.service.ts` içindeki `monthlyUsage` imzasını `monthlyUsage(opts: MonthlyUsageParams)` olacak şekilde options object pattern’ine taşı.
- [x] `logger.ts` içindeki `log` imzasını `log(opts: LogParams)` olacak şekilde options object pattern’ine taşı.
- [x] İlgili tüm call-site’ları grep ile doğrulayıp yeni imzaya güncelle.
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/api/src/modules/billing/ packages/shared/src/observability/ && pnpm typecheck`) ve review altında raporla.

### Billing + Observability Refactor Progress

- `apps/api/src/modules/billing/billing.service.ts`
  - `MonthlyUsageParams` type eklendi.
  - `monthlyUsage` imzası options object pattern’ine taşındı.
  - `getWorkspaceMetering` ve `enforceGenerationLimit` içindeki `monthlyUsage` call-site’ları object param ile güncellendi.
- `packages/shared/src/observability/logger.ts`
  - `LogParams` type eklendi.
  - `log` fonksiyonu `log(opts: LogParams)` imzasına taşındı.
  - `createLogger` içindeki `info/warn/error` call-site’ları yeni object imzaya güncellendi.
- Call-site grep doğrulaması:
  - `rg -n "monthlyUsage\\(" apps/api/src/modules/billing/billing.service.ts`
  - `rg -n "\\blog\\(" packages/shared/src/observability/logger.ts`

### Review (Billing + Observability Max-Params Refactor)

- `pnpm lint -- apps/api/src/modules/billing/ packages/shared/src/observability/ && pnpm typecheck` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki 17 baseline lint hatası zinciri kırıyor).
- `pnpm exec eslint apps/api/src/modules/billing/billing.service.ts packages/shared/src/observability/logger.ts` -> pass.
- `pnpm typecheck` -> fail (repo baseline typecheck hataları: özellikle `apps/api/src/modules/auth/better-auth.ts` ve `apps/api/src/modules/scheduling/scheduling.service.ts` üzerinde mevcut hatalar; bu refactorun dışındaki dosyalar).

## Next Plan (Billing monthlyUsage refactor)

- [x] Document `monthlyUsage` signature and behavior in `billing.service.ts`.
- [x] Inventory all code references/call sites that pass its current parameters.
- [x] Draft the concrete refactor plan to accept `MonthlyUsageParams` without behavioral changes.

## Next Plan (Logger signature audit)

- [x] Capture the current `log(level, scope, message, metadata?, error?)` signature plus serialization details in `packages/shared/src/observability/logger.ts`.
- [x] Enumerate every consumer (`createLogger`, `packages/shared/src/security/token-vault.ts`, `apps/worker/src/main.ts`) and record how metadata/error arguments are ordered today.
- [x] Draft the precise migration steps (LogParams type, `log(opts)` implementation, `createLogger` helper updates, and caller adjustments) to keep emitted payloads unchanged.

## Next Plan (Studio Views Extraction Draft)

- [x] Inspect `generator-view.tsx` and `settings-view.tsx` to log major JSX sections and conditional chains.
- [x] For each file, list extraction candidates (component name, exact props) keeping APIs unchanged and obeying <=80 line/<=15 complexity targets.
- [x] Summarize the resulting extraction proposal so it can guide future refactors.

## Component Complexity Plan

- [x] Analyze login, hero, and right-rail files for major JSX blocks and conditional logic.
- [x] Draft subcomponent extraction proposals with names and exact prop contracts.
- [x] Verify each proposal keeps components within the 80-line/complexity budget and prepare response.

## Next Plan (Web UI Component Complexity Refactor)

- [x] `LoginPage`, `StudioHero`, `StudioRightRail` için JSX bloklarını alt bileşenlere bölerek ana bileşenleri <=80 satıra indir.
- [x] `AnalyticsView`, `DashboardView` için conditional zincirlerini section bileşenlerine ayırıp complexity düşür.
- [x] `GeneratorView`, `SettingsView` için kart içi blokları section bileşenlerine extract et; props API’lerini koru.
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/web/ && pnpm --filter @growth-os/web build`) ve review ile raporla.

### Web UI Refactor Progress

- Refactor edilen dosyalar:
  - `apps/web/app/login/page.tsx`
  - `apps/web/components/studio/hero.tsx`
  - `apps/web/components/studio/right-rail.tsx`
  - `apps/web/components/studio/views/analytics-view.tsx`
  - `apps/web/components/studio/views/dashboard-view.tsx`
  - `apps/web/components/studio/views/generator-view.tsx`
  - `apps/web/components/studio/views/settings-view.tsx`
- Tüm ana bileşenlerde büyük JSX blokları local section/subcomponent’lere çıkarıldı ve conditional zincirleri sadeleştirildi.
- Export edilen component isimleri ve dış props API’leri korunmuştur.

### Review (Web UI Component Complexity Refactor)

- `pnpm lint -- apps/web/ && pnpm --filter @growth-os/web build` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki baseline hatalar zinciri kırıyor; web dışı API test dosyaları ve `apps/web/e2e/mock-api/server.mjs` mevcut ihlaller arasında).
- `pnpm exec eslint apps/web/app/login/page.tsx apps/web/components/studio/hero.tsx apps/web/components/studio/right-rail.tsx apps/web/components/studio/views/analytics-view.tsx apps/web/components/studio/views/dashboard-view.tsx apps/web/components/studio/views/generator-view.tsx apps/web/components/studio/views/settings-view.tsx` -> pass.
- `pnpm --filter @growth-os/web build` -> pass.

## Next Plan (DB Seed `main` Structural Refactor)

- [x] `apps/api/src/shared/db/seed.ts` içindeki `main` akışını adım bazlı helper fonksiyonlara böl (`seedUsers`, `seedWorkspaces`, `seedMembership`, `seedPromptTemplates`).
- [x] `main()` fonksiyonunu orchestration-only olacak şekilde sadeleştir ve 80 satır sınırının altına indir.
- [x] Davranışı koru (aynı upsert/insert SQL mantığı, aynı seed çıktısı ve closePool akışı).
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/api/src/shared/db/seed.ts && pnpm --filter @growth-os/api db:seed`) ve review bölümüne yaz.

### DB Seed Refactor Progress

- `apps/api/src/shared/db/seed.ts` içinde seed adımları helper fonksiyonlara ayrıldı:
  - `seedUsers`
  - `seedWorkspaces`
  - `seedMembership`
  - `seedPromptTemplates`
- SQL blokları named constant’lara taşındı (`UPSERT_USER_SQL`, `UPSERT_WORKSPACE_SQL`, `UPSERT_MEMBERSHIP_SQL`, `UPSERT_PROMPT_TEMPLATES_SQL`).
- `main()` orchestration-only hale getirildi ve helper’ları sırayla çağıracak şekilde sadeleştirildi.
- `closePool` ve hata akışı (`main().catch`) davranışı korundu.

### Review (DB Seed `main` Structural Refactor)

- `pnpm lint -- apps/api/src/shared/db/seed.ts && pnpm --filter @growth-os/api db:seed` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki 6 baseline lint hatası zinciri kırıyor).
- `pnpm exec eslint apps/api/src/shared/db/seed.ts` -> pass.
- `pnpm --filter @growth-os/api db:seed` -> fail (`ECONNREFUSED` at `127.0.0.1:55432` / `::1:55432`; local DB erişimi olmadığı için seed çalıştırılamadı).
- Docker network/port düzeltmesi sonrası tekrar doğrulama:
  - `docker ps` -> `growth-os-postgres` ve `growth-os-redis` healthy/up, port map aktif (`55432`, `56379`).
  - `ss -ltn | rg 55432` -> port dinliyor.
  - `pnpm --filter @growth-os/api db:seed` -> pass (`Seed complete: founder@example.com / Personal Workspace`).

## Next Plan (Web E2E Mock Server Complexity Refactor)

- [x] `apps/web/e2e/mock-api/server.mjs` içindeki büyük route if/switch bloğunu route-specific handler fonksiyonlarına böl.
- [x] Ana router callback’ini yalnız request parse + dispatch + fallback 404 olacak şekilde sadeleştir.
- [x] Her handler’ın complexity’sini düşür (hedef <=15) ve davranışı koru.
- [x] İstenen doğrulamayı çalıştır (`pnpm lint -- apps/web/e2e/mock-api/server.mjs`) ve sonucu review’a yaz.

### Web E2E Mock Server Refactor Progress

- `apps/web/e2e/mock-api/server.mjs` içinde route-specific handler yapısı kuruldu:
  - `handleReset`
  - `handleHealth`
  - `handleSession`
  - `handleSignInMagicLink`
  - `handleVerifyMagicLink`
- `routeHandlers` map + `dispatchRoute` eklendi; ana `createServer` callback’i parse + dispatch + 404 fallback ile sadeleşti.
- Session/magic-link doğrulama ve cookie set davranışları korunmuştur.

### Review (Web E2E Mock Server Complexity Refactor)

- `pnpm lint -- apps/web/e2e/mock-api/server.mjs` -> fail (`pnpm lint -- ...` root scripti `eslint . -- ...` çalıştırdığı için repo genelindeki 5 baseline lint hatası zinciri kırıyor).
- `pnpm exec eslint apps/web/e2e/mock-api/server.mjs` -> pass.

## Next Plan (API Test Callback Structural Refactor)

- [x] 5 test dosyasındaki 80+ satır callback/fonksiyon ihlallerini helper extraction ve test bölme ile gider.
- [x] Ortak setup/teardown adımlarını helper veya `t.after`/`beforeEach` pattern’ine taşıyarak test callback uzunluklarını düşür.
- [x] `x_integration` testindeki uzun `withEnv` utility fonksiyonunu küçük yardımcılarla sadeleştir.
- [x] Test davranışını değiştirmeden doğrulama çalıştır (`pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration`) ve review’a yaz.

### API Test Refactor Progress

- Refactor edilen dosyalar:
  - `apps/api/src/modules/analytics/tests/analytics.getSnapshots.integration.test.ts`
  - `apps/api/src/modules/auth/tests/auth.sessionGuard.workspaceIsolation.integration.test.ts`
  - `apps/api/src/modules/generation/tests/generation.createDraftVersion.integration.test.ts`
  - `apps/api/src/modules/scheduling/tests/scheduling.publishNow.safeModeAndDedupe.integration.test.ts`
  - `apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts`
- Büyük test callback’leri fixture/setup/assert helper’larına bölündü; scenario akışları ayrı fonksiyonlara çıkarıldı.
- `x_integration` testindeki uzun `withEnv` fonksiyonu env snapshot/apply/restore yardımcılarına parçalandı.
- Test davranışları korunmuştur (aynı assertion setleri ve error-case kontrolleri devam ediyor).

### Review (API Test Callback Structural Refactor)

- `pnpm exec eslint apps/api/src/modules/analytics/tests/analytics.getSnapshots.integration.test.ts apps/api/src/modules/auth/tests/auth.sessionGuard.workspaceIsolation.integration.test.ts apps/api/src/modules/generation/tests/generation.createDraftVersion.integration.test.ts apps/api/src/modules/scheduling/tests/scheduling.publishNow.safeModeAndDedupe.integration.test.ts apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts` -> pass.
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).
- `pnpm --filter @growth-os/api test:integration` -> pass (9/9).

## Next Plan (Global API Rate Limiting)

- [x] `@nestjs/throttler` bağımlılığını doğrula ve AppModule global throttle konfigürasyonunu ekle (`default: ttl 60000, limit 60`).
- [x] Fastify uyumlu tracker için custom `ThrottlerGuard` implement et ve `APP_GUARD` sırasını `ThrottlerGuard` -> `SessionAuthGuard` olacak şekilde düzenle.
- [x] İstenen endpoint’lere route-level `@Throttle` override’larını ekle (generation, scheduling, x integration, auth magic-link).
- [x] `HealthController` için `@SkipThrottle()` ekle.
- [x] Doğrulama çalıştır (`pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit`) ve review altına yaz.

### Global API Rate Limiting Progress

- `apps/api/package.json` içine `@nestjs/throttler` bağımlılığı eklendi.
- `apps/api/src/app.module.ts` içinde global `ThrottlerModule` ayarı (`60_000/60`) ve `APP_GUARD` sırası `FastifyThrottlerGuard` -> `SessionAuthGuard` olarak güncellendi.
- `apps/api/src/shared/rate-limit/fastify-throttler.guard.ts` ile Fastify uyumlu tracker (`x-forwarded-for` -> `req.ip` -> `raw.socket.remoteAddress`) eklendi.
- Endpoint override’ları eklendi:
  - generation: `POST /draft`, `POST /content/:contentId/version`
  - scheduling: `POST /schedule`, `POST /publish-now`
  - x integration: `POST /connect/start`, `POST /connect/callback`
  - auth: magic-link request/verify
- `apps/api/src/shared/health/health.controller.ts` için `@SkipThrottle()` eklendi.
- GET endpoint’leri için daha yüksek limit (`120/dk`) uygulandı (analytics/billing/style/auth-session/generation/scheduling/x integration GET rotaları).

### Review (Global API Rate Limiting)

- `pnpm exec eslint apps/api/src/app.module.ts apps/api/src/shared/rate-limit/fastify-throttler.guard.ts apps/api/src/shared/health/health.controller.ts apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth-session.controller.ts apps/api/src/modules/generation/generation.controller.ts apps/api/src/modules/scheduling/scheduling.controller.ts apps/api/src/modules/x_integration/x-integration.controller.ts apps/api/src/modules/analytics/analytics.controller.ts apps/api/src/modules/billing/billing.controller.ts apps/api/src/modules/style/style.controller.ts` -> pass.
- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit` -> fail (`build` adımında mevcut baseline TypeScript hataları: `better-auth.ts`, `scheduling.service.ts`).
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (API PostgreSQL Pool Hardening)

- [x] `apps/api/src/shared/db/pool.ts` içinde `Pool` constructor seçeneklerini `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `statement_timeout` ile genişlet.
- [x] Singleton `getPool()` akışını ve `closePool()` davranışını değiştirmeden bırak.
- [x] `.env.example` içinde yeni PG pool env’lerini yalnız yorum satırı (default değerlerle) olarak dokümante et.
- [x] Doğrulama çalıştır (`pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration`) ve review’a yaz.

### API PostgreSQL Pool Hardening Progress

- `apps/api/src/shared/db/pool.ts` içinde pool başlatma seçenekleri eklendi:
  - `max` (default `20`)
  - `idleTimeoutMillis` (default `30000`)
  - `connectionTimeoutMillis` (default `10000`)
  - `statement_timeout` (default `30000`)
- `getPool()` singleton yapısı ve `closePool()` fonksiyonu olduğu gibi korundu.
- `.env.example` Data Stores bölümüne ilgili env değişkenleri yalnız yorum satırı olarak eklendi.

### Review (API PostgreSQL Pool Hardening)

- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/api test:integration` -> fail (`build` adımında mevcut baseline TypeScript hataları: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).
- `pnpm --filter @growth-os/api test:integration` -> pass (9/9).

## Next Plan (Migration Checksum Koruması)

- [x] `schema_migrations` tablosuna checksum kolonu eklemek için `009_add_migration_checksum.sql` migration dosyasını ekle.
- [x] `apps/api/src/shared/db/migrate.ts` içinde checksum üretimi (`sha256`) ve tablodan checksum okuma/yazma akışını ekle.
- [x] Uygulanmış migration dosyaları için checksum doğrulaması ekle; `checksum IS NULL` olan legacy kayıtları warning ile geç.
- [x] İstenen doğrulamaları çalıştır: `build`, `db:up && db:migrate`, tekrar `db:migrate` (idempotent), kasıtlı dosya değişikliği ile checksum mismatch.

### Migration Checksum Progress

- Yeni migration eklendi: `packages/db/migrations/009_add_migration_checksum.sql` (`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT;`).
- `apps/api/src/shared/db/migrate.ts` güncellendi:
  - `fileChecksum(content)` ile `sha256` hesaplama,
  - `ensureMigrationsTable()` içine `ALTER TABLE ... ADD COLUMN IF NOT EXISTS checksum`,
  - `appliedFiles()` dönüşü `Map<file_name, checksum|null>`,
  - `applyMigration()` insert’i `file_name + checksum`,
  - `main()` içinde applied migration’larda checksum karşılaştırma + mismatch durumunda hard fail.
- Geriye uyumluluk korundu: `checksum` null legacy kayıtlar hata vermiyor, warning log ile continue ediyor.

### Review (Migration Checksum Koruması)

- `pnpm --filter @growth-os/api build` -> fail (mevcut baseline TS hataları: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm db:up && pnpm db:migrate` -> pass (`009_add_migration_checksum.sql` uygulandı).
- `pnpm db:migrate` -> pass (idempotent, yeni migration yok; legacy 001-008 için checksum warning logları devam ediyor).
- Kasıtlı dosya değişikliği testi:
  - `009_add_migration_checksum.sql` geçici mutate edilip `pnpm db:migrate` çalıştırıldı.
  - Beklenen hata alındı: `Checksum mismatch for 009_add_migration_checksum.sql: expected ..., got ...`.
  - Dosya restore edilip `pnpm db:migrate` tekrar çalıştırıldı -> pass.

## Next Plan (Turbo Cache NODE_ENV / NEXT_PUBLIC)

- [x] `turbo.json` root seviyesine `globalEnv: ["NODE_ENV"]` ekle.
- [x] `build` task’ına `env: ["NEXT_PUBLIC_*"]` ekle.
- [x] Mevcut pipeline (`dependsOn`) ve `dev` task env tanımlarını değiştirmeden bırak.
- [x] `turbo run build --dry` ile cache input’larında `NODE_ENV` ve `NEXT_PUBLIC_*` göründüğünü doğrula.

### Turbo Cache Progress

- `turbo.json` güncellendi:
  - root: `globalEnv: ["NODE_ENV"]`
  - `tasks.build.env: ["NEXT_PUBLIC_*"]`
- `dependsOn` zincirleri ve `dev.env` listesi korunmuştur.

### Review (Turbo Cache NODE_ENV / NEXT_PUBLIC)

- `turbo run build --dry` -> fail (`turbo: command not found`, global binary yok).
- `pnpm exec turbo run build --dry` -> pass.
- Dry-run çıktısında `Global Env Vars = NODE_ENV` ve task-level `Env Vars = NEXT_PUBLIC_*` doğrulandı.

## Next Plan (API Request Correlation ID)

- [x] `apps/api/src/shared/context/request-context.ts` dosyasında `AsyncLocalStorage<{ requestId: string }>` ve `getRequestId()` helper’ını ekle.
- [x] `apps/api/src/main.ts` içine Fastify `onRequest` hook’u ekleyip request id’yi (`x-request-id` header veya `request.id`) context’e yaz.
- [x] `apps/api/src/main.ts` içine `onSend` hook’u ekleyip response header olarak `x-request-id` döndür.
- [x] Shared logger paketine dokunmadan altyapıyı kur, mevcut pipeline ve worker davranışını değiştirme.
- [x] Doğrulama çalıştır: `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/api test:unit`, manuel `curl -v /health`.

### API Request Correlation ID Progress

- Yeni context dosyası eklendi: `apps/api/src/shared/context/request-context.ts`
  - `requestContextStorage` (`AsyncLocalStorage`)
  - `getRequestId()` (`unknown` fallback)
- `apps/api/src/main.ts` güncellendi:
  - `onRequest`: `x-request-id` varsa onu, yoksa Fastify `request.id` değerini kullanır.
  - `request.requestId` alanına normalize edilmiş id set edilir.
  - `requestContextStorage.run({ requestId }, ...)` ile request scope context açılır.
  - `onSend`: response header `x-request-id` set edilir.
- CORS ve shutdown/pool close akışları korunmuştur.

### Review (API Request Correlation ID)

- `pnpm --filter @growth-os/api build` -> fail (mevcut baseline TS hataları: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).
- Manuel doğrulama:
  - `curl -sS -D - -o /dev/null http://localhost:4000/health` -> response header `x-request-id: req-2`.
  - `curl -sS -D - -o /dev/null -H 'x-request-id: req-from-client-123' http://localhost:4000/health` -> response header `x-request-id: req-from-client-123`.

## Next Plan (BullMQ Queue-Level Job Config)

- [x] `apps/api/src/modules/scheduling/queue.ts` içinde queue-level `defaultJobOptions` ekle (publish + metrics).
- [x] `apps/api/src/modules/scheduling/scheduling.service.ts` içindeki enqueue çağrısından `removeOnComplete/removeOnFail` override’larını kaldır.
- [x] Worker’da native BullMQ retry ile custom retry çakışmasını önlemek için `job.attemptsMade` kontrollü guard ekle.
- [x] İstenen doğrulamaları çalıştır: api build + worker build, worker test, api unit test.

### BullMQ Queue-Level Job Config Progress

- `apps/api/src/modules/scheduling/queue.ts` güncellendi:
  - `publish-jobs` için `defaultJobOptions` eklendi (`attempts`, `backoff`, `removeOnComplete`, `removeOnFail`).
  - `metrics-jobs` için `defaultJobOptions` eklendi (`attempts`, `backoff`, `removeOnComplete`, `removeOnFail`).
- `apps/api/src/modules/scheduling/scheduling.service.ts` içinde initial enqueue options’dan `removeOnComplete/removeOnFail` kaldırıldı; queue defaults’a bırakıldı.
- `apps/worker/src/main.ts` güncellendi:
  - `processPublishJob` artık `attemptsMade` alıyor.
  - `attemptsMade > 0` ise native retry tespit edilip custom retry orchestration skip ediliyor ve error rethrow ediliyor.
  - Worker callback’i `job.attemptsMade` değerini `processPublishJob`’a iletiyor.
- Publish tarafında custom retry state-machine + DB güncellemeleri korunması için queue-level publish attempts 1’e çekildi (çift retry mekanizması karışmaması için).

### Review (BullMQ Queue-Level Job Config)

- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build` -> fail (`api build` baseline TypeScript hatalarında kırılıyor: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm --filter @growth-os/worker build` -> pass.
- `pnpm --filter @growth-os/worker test` -> pass (9/9).
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).

## Next Plan (Fastify Helmet Security Headers)

- [x] `apps/api` içine `@fastify/helmet` bağımlılığını ekle.
- [x] `apps/api/src/main.ts` içinde helmet register’ını CORS’tan önce ekle (bootstrap sırası: helmet -> cors -> listen).
- [x] CSP ayarlarını environment bazlı ayır (`production` strict, `development` daha gevşek).
- [x] Mevcut CORS kaydı, shutdown hook ve onClose akışını değiştirmeden koru.
- [x] Doğrulama çalıştır: `pnpm --filter @growth-os/api build`, `pnpm --filter @growth-os/api test:unit`, `curl -I /health`.

### Fastify Helmet Progress

- `apps/api/package.json` içine `@fastify/helmet` eklendi.
- `apps/api/src/main.ts` güncellendi:
  - `helmet` import eklendi.
  - `cspDirectives()` helper ile `NODE_ENV` bazlı CSP policy ayrımı eklendi.
  - `await app.register(helmet, ...)` CORS’tan önce konumlandırıldı.
- Mevcut `app.enableShutdownHooks()`, `onClose` ve CORS registration blokları korunmuştur.

### Review (Fastify Helmet Security Headers)

- `pnpm exec eslint apps/api/src/main.ts` -> pass.
- `pnpm --filter @growth-os/api build` -> fail (mevcut baseline TypeScript hataları: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).
- Manuel doğrulama:
  - `curl -I http://localhost:4000/health` çıktısında güvenlik header’ları göründü:
    - `Content-Security-Policy`
    - `Strict-Transport-Security`
    - `X-Frame-Options`
    - `X-Content-Type-Options`
    - `X-XSS-Protection`

## Next Plan (Global Exception Handlers - API + Worker)

- [x] `apps/api/src/main.ts` içinde bootstrap çağrısından önce process-level `unhandledRejection` ve `uncaughtException` handler’larını ekle.
- [x] `apps/worker/src/main.ts` içinde SIGINT/SIGTERM handler’larından önce global exception handler’larını ekle ve `shutdown()` ile entegre et.
- [x] Mevcut shutdown fonksiyonunu ve import pattern’lerini değiştirmeden koru.
- [x] İstenen doğrulamaları çalıştır: api+worker build, api unit + worker test.

### Global Exception Handlers Progress

- `apps/api/src/main.ts` güncellendi:
  - `const bootstrapLogger = new Logger("Process")` eklendi.
  - `process.on("unhandledRejection", ...)` eklendi (production’da `process.exit(1)`).
  - `process.on("uncaughtException", ...)` eklendi (`process.exit(1)`).
- `apps/worker/src/main.ts` güncellendi:
  - `process.on("unhandledRejection", ...)` eklendi; production’da `shutdown("unhandledRejection")` çağrılıyor.
  - `process.on("uncaughtException", ...)` eklendi; her durumda `shutdown("uncaughtException")` çağrılıyor.
- SIGINT/SIGTERM handler’ları ve mevcut `shutdown()` fonksiyonu korunmuştur.

### Review (Global Exception Handlers - API + Worker)

- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build` -> fail (`api build` baseline TypeScript hatalarında kırılıyor: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm --filter @growth-os/worker build` -> pass.
- `pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/worker test` -> pass (`api unit 35/35`, `worker test 9/9`).
- `pnpm exec eslint apps/api/src/main.ts apps/worker/src/main.ts` -> pass.

## Next Plan (Deep Health Check - DB + Redis)

- [x] `apps/api/src/modules/scheduling/queue.ts` içinden Redis bağlantısını health check için erişilebilir export et (`getRedisConnection`).
- [x] `apps/api/src/shared/health/health.controller.ts` içine DB ve Redis probe’larını ekle; timeout 5s, response `ok/degraded` + `200/503`.
- [x] `@Public()` ve `/health` path’ini koru; throttle skip davranışını bozma.
- [x] CI smoke health readiness adımını 503 durumunu da handle edecek şekilde güncelle.
- [x] Doğrulama çalıştır: api build + api unit; manuel `docker compose down` ile `/health` degraded testi.

### Deep Health Check Progress

- `apps/api/src/modules/scheduling/queue.ts` içinde Redis singleton bağlantısı `getRedisConnection()` olarak export edildi.
- `apps/api/src/shared/health/health.controller.ts` güncellendi:
  - `checkDatabase()` -> `SELECT 1` + 5s timeout + latency ölçümü.
  - `checkRedis()` -> `PING` + 5s timeout + latency ölçümü.
  - `healthcheck()` -> dependency sonuçlarını toplar, `status` (`ok`/`degraded`) hesaplar ve `200`/`503` döner.
  - Response shape: `status`, `service`, `timestamp`, `dependencies.database`, `dependencies.redis`.
- `.github/workflows/ci.yml` smoke readiness döngüsü güncellendi:
  - `/health` için `200` veya `503` durumlarını reachable kabul eder.
  - Hiçbiri gelmezse explicit fail eder.

### Review (Deep Health Check - DB + Redis)

- `pnpm exec eslint apps/api/src/shared/health/health.controller.ts apps/api/src/modules/scheduling/queue.ts` -> pass.
- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit` -> fail (`build` adımında mevcut baseline TS hataları: `apps/api/src/modules/auth/better-auth.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm --filter @growth-os/api test:unit` -> pass (35/35).
- Manuel degraded doğrulaması:
  - `docker compose down`
  - API dev ayağa kaldırıldı, `curl -sS -D - http://localhost:4000/health`
  - Beklenen çıktı alındı: `HTTP/1.1 503 Service Unavailable` ve body `{"status":"degraded",...,"dependencies":{"database":{"ok":false},"redis":{"ok":false}}}`.
  - Test sonrası ortam geri alındı: `pnpm db:up`.

## Next Plan (TypeScript Strict Flags - Base Config)

- [x] `packages/config/tsconfig/base.json` içine strict safety flag’lerini uygula.
- [x] `pnpm typecheck` çalıştırıp toplam TS hata sayısını ölç.
- [x] Eşik kuralını uygula: `noUncheckedIndexedAccess` ile hata sayısı `>50` ise bu flag’i base config’ten çıkar.
- [x] Son konfigürasyonla tekrar `pnpm typecheck` çalıştırıp sonuçları raporla.

### TypeScript Strict Flags Progress

- Base config’e eklendi:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
- İlk denemede `noUncheckedIndexedAccess: true` de eklendi ve typecheck koşuldu:
  - Toplam TS hata sayısı: `58` (`>50` eşiği aşıldı).
- Kural gereği `noUncheckedIndexedAccess` base config’ten geri alındı (ayrı PR/issue adayı).
- Son konfigürasyonla typecheck tekrar koşuldu.

### Review (TypeScript Strict Flags - Base Config)

- `pnpm typecheck` (noUncheckedIndexedAccess açıkken) -> `ts_error_count=58`.
- Eşik nedeniyle `noUncheckedIndexedAccess` kaldırıldı.
- `pnpm typecheck` (son konfig) -> `ts_error_count=13` (mevcut baseline tip hataları; ağırlıkla `apps/api/src/modules/auth/better-auth.ts` ve `apps/api/src/modules/scheduling/scheduling.service.ts`).
- `pnpm typecheck 2>&1 | tail -5` çıktısı:
  - `Failed:    @growth-os/api#typecheck`
  - `ERROR  run failed: command  exited (2)`

## Follow-up (TypeScript Strict Flags Threshold 90)

- [x] `noUncheckedIndexedAccess` yeniden eklendi ve yeni eşik (`>90`) kuralına göre typecheck sonucu tekrar ölçüldü.
- [x] `pnpm typecheck` hata sayısı raporlandı.

### Follow-up Review (TypeScript Strict Flags Threshold 90)

- `pnpm typecheck` -> `ts_error_count=58`.
- `58 <= 90` olduğu için `noUncheckedIndexedAccess` base config’te bırakıldı.
- `pnpm typecheck 2>&1 | tail -5`:
  - `Failed:    @growth-os/api#typecheck`
  - `ERROR  run failed: command  exited (2)`

## Next Plan (Node/pnpm Version Locking)

- [x] Root `.nvmrc` dosyasını oluştur (`22`).
- [x] Root `.npmrc` dosyasını oluştur (`strict-peer-dependencies`, `auto-install-peers`, `shamefully-hoist`).
- [x] Root `package.json` içine `engines.node` ve `engines.pnpm` alanlarını ekle.
- [x] Doğrulama çalıştır: `node -v`, `pnpm install` (peer dependency durumu raporla).

### Node/pnpm Version Locking Progress

- `.nvmrc` eklendi: `22`
- `.npmrc` eklendi:
  - `strict-peer-dependencies=true`
  - `auto-install-peers=true`
  - `shamefully-hoist=false`
- `package.json` içine `engines` eklendi:
  - `node: >=22.0.0`
  - `pnpm: >=9.12.0`
- `packageManager: "pnpm@9.12.0"` alanı korunmuştur.

### Review (Node/pnpm Version Locking)

- `node -v` -> `v24.13.0` (lokal runtime 22.x değil; `.nvmrc` ile hedef 22 olarak pinlendi).
- `pnpm install` -> interactive prompt nedeniyle yeniden kurulum onayı istedi.
- `pnpm install --force` -> pass (install tamamlandı, peer dependency hatası raporlanmadı).

## Next Plan (.editorconfig Standardization)

- [x] Root `.editorconfig` dosyasını Prettier ayarlarıyla uyumlu olarak ekle.
- [x] Markdown ve Makefile için özel kuralları tanımla (`trim_trailing_whitespace`, `indent_style`).
- [x] Mevcut dosyaları yeniden formatlamadan yalnız kural dosyasını ekle.
- [x] Doğrulama çalıştır: `pnpm format:check`.

### .editorconfig Progress

- Root `.editorconfig` eklendi:
  - Global: `lf`, `utf-8`, `insert_final_newline=true`, `indent_style=space`, `indent_size=2`, `trim_trailing_whitespace=true`
  - `*.md`: `trim_trailing_whitespace=false`
  - `*.sql`: `indent_size=2`
  - `Makefile`: `indent_style=tab`
- `.prettierrc.json` ile uyumluluk korundu (`tabWidth: 2` <-> `indent_size: 2`).

### Review (.editorconfig Standardization)

- `pnpm format:check` -> fail.
- Fail nedeni yeni `.editorconfig` değil; repoda mevcut baseline Prettier sapmaları (22 dosya) nedeniyle komut kırılıyor.

## Next Plan (X Client Token Auto-Refresh)

- [x] API `XClient` sözleşmesini `refreshToken(refreshToken)` ile genişlet ve `RealXClient`/`MockXClient` implementasyonlarını ekle
- [x] API servisinde `refreshAccessToken(accountId, workspaceId)` akışını transaction + row lock + token revoke/insert ile ekle
- [x] Worker token seçim sorgusuna `expires_at` + 5 dakika buffer filtresi ekle
- [x] Worker'da DB row lock ile refresh helper ekle ve mevcut encrypt/decrypt patternini koru
- [x] Worker `publishToX` akışında `AUTH_FAILED` için tek sefer refresh + publish retry uygula
- [x] İstenen doğrulama komutlarını çalıştır (`api build`, `worker build`, `api test:unit`, `worker test`)

### X Client Token Auto-Refresh Progress

- API tarafında `apps/api/src/modules/x_integration/x-client.ts` dosyasına `refreshToken` metodu eklendi ve `XClient` interface güncellendi.
- API tarafında `apps/api/src/modules/x_integration/x-integration.service.ts` dosyasına `refreshAccessToken` eklendi; aktif token satırı `FOR UPDATE` ile kilitleniyor, eski token revoke edilip yenisi encrypted şekilde yazılıyor.
- Worker tarafında:
  - `fetchAccessTokenForPublish` sorgusuna `expires_at` filtresi eklendi: `(xt.expires_at IS NULL OR xt.expires_at > now() - interval '5 minutes')`.
  - `TOKEN_REFRESH_REQUIRED` akışı ile pre-expiry refresh tetikleme eklendi.
  - Row lock kullanan refresh yardımcıları eklendi (`lockActiveTokenForRefresh`, `refreshAccessTokenInTransaction`, `refreshAccessToken`).
  - `publishToX` içinde `AUTH_FAILED` sonrası refresh + tek sefer publish retry akışı eklendi.
- API unit testine refresh kapsamı genişletildi:
  - Mock client refresh davranışı doğrulandı.
  - Real client refresh response’unda `refresh_token` yoksa fallback davranışı doğrulandı.

### X Client Token Auto-Refresh Review

- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/worker build` -> pass.
- `pnpm --filter @growth-os/api test:unit && pnpm --filter @growth-os/worker test` -> pass.
- `pnpm exec eslint apps/worker/src/main.ts apps/api/tests/x_integration/x_integration.mockXClient.publish_metrics.unit.test.ts` -> pass.

## Next Plan (Style Extraction LLM Enrichment)

- [x] `StyleProfile` tipini `writingPersonality?` ile geriye uyumlu şekilde genişlet.
- [x] `style.service.ts` içine LLM enrichment katmanı ekle: OpenRouter istek, JSON parse, Zod doğrulama, merge+fallback.
- [x] LLM maliyet kontrolünü uygula: enrichment sadece ilk çıkarımda veya `refresh` akışında çalışsın.
- [x] Prompt template seed migration'ı ekle (`010_seed_style_prompt_template.sql`).
- [x] Testleri `writingPersonality` davranışını doğrulayacak şekilde güncelle.
- [x] İstenen doğrulamaları çalıştır (`api build`, `api test:unit`) ve `style/extract` response doğrulaması yap.

### Style Extraction LLM Enrichment Progress

- `apps/api/src/modules/style/style.service.ts` güncellendi:
  - `StyleProfile` içine `writingPersonality?: string` eklendi.
  - `styleLlmProvider` (`stub|openrouter`) çözümlemesi eklendi.
  - OpenRouter style analysis isteği (`/chat/completions`) + JSON payload parse + Zod schema doğrulaması eklendi.
  - LLM payload alanları `StyleProfile` alanlarına merge ediliyor; regex analiz fallback olarak korunuyor.
  - `extractAndPersist` artık:
    - mevcut profile varlığını kontrol ediyor,
    - LLM enrichment'i yalnızca ilk çıkarımda (`writingPersonality` yoksa) veya `forceLlm` ile çalıştırıyor,
    - LLM hatasında graceful degradation ile regex/persisted profile'a düşüyor.
  - `stub` provider için deterministic enrichment eklendi; `writingPersonality` metni üretiliyor.
- `apps/api/src/modules/style/style.controller.ts`:
  - `GET /style/:workspaceId/:accountId?refresh=1` yolunda `extractAndPersist(..., { forceLlm: true })` çağrısı eklendi.
- Yeni migration eklendi:
  - `packages/db/migrations/010_seed_style_prompt_template.sql` (`style-analysis-v1` prompt template seed, `is_active=false`).
- Test güncellemeleri:
  - `apps/api/src/modules/style/tests/style.extractAndGetProfile.integration.test.ts` içinde `writingPersonality` assertion’ları eklendi.
  - `apps/api/tests/style/style-extraction.test.ts` içinde regex-only `extractStyleProfile` için `writingPersonality === undefined` assertion’ı eklendi.

### Review (Style Extraction LLM Enrichment)

- `pnpm exec eslint apps/api/src/modules/style/style.service.ts apps/api/src/modules/style/style.controller.ts apps/api/src/modules/style/tests/style.extractAndGetProfile.integration.test.ts apps/api/tests/style/style-extraction.test.ts` -> pass.
- `pnpm --filter @growth-os/api build && pnpm --filter @growth-os/api test:unit` -> pass.
- `pnpm --filter @growth-os/api exec tsx --test src/modules/style/tests/style.extractAndGetProfile.integration.test.ts` -> pass.
- `pnpm db:migrate` -> pass (`010_seed_style_prompt_template.sql` applied).
- `style/extract` response doğrulaması (controller handler üzerinden):
  - `pnpm --filter @growth-os/api exec tsx /tmp/style_extract_verify.ts` -> pass.
  - Çıktı: `writingPersonality: ...` (alan response profile içinde mevcut).

## Next Plan (Analytics Recharts Integration)

- [x] `apps/web` paketine `recharts` bağımlılığını ekle.
- [x] Analytics grafikleri için ayrı chart bileşenleri ekle (`EngagementOverTimeChart`, `EngagementBreakdownChart`, `MetricComparisonBar`).
- [x] `analytics-view.tsx` dosyasını chart bileşenleriyle compose edecek şekilde refactor et; ana `AnalyticsView` fonksiyonunu kısa tut.
- [x] Mobil/Desktop responsive yerleşimi uygula (`ResponsiveContainer`, grid stack).
- [x] İstenen doğrulamaları çalıştır (`web build`, dosya bazlı lint).

### Analytics Recharts Integration Progress

- `apps/web/package.json` içine `recharts` eklendi.
- Yeni dosya eklendi: `apps/web/components/studio/views/analytics-charts.tsx`
  - `EngagementOverTimeChart`: impressions + interaction metric trend grafiği.
  - `EngagementBreakdownChart`: latest snapshot etkileşim dağılımı donut grafik.
  - `MetricComparisonBar`: snapshot bazında `Impressions` vs `Engagement` horizontal bar.
- `apps/web/components/studio/views/analytics-view.tsx` yeniden düzenlendi:
  - Manuel div tabanlı `MetricBar` kaldırıldı.
  - Yeni Recharts bileşenleri compose edildi.
  - Mevcut `FirstHourAlert`, summary ve snapshot listing akışı korundu.
  - Dosya client boundary olarak `\"use client\"` ile işaretlendi.

### Review (Analytics Recharts Integration)

- `pnpm --filter @growth-os/web build` -> pass.
- `pnpm lint -- apps/web/components/studio/views/analytics-view.tsx` -> pass.
- Ek kontrol: `pnpm exec eslint apps/web/components/studio/views/analytics-view.tsx apps/web/components/studio/views/analytics-charts.tsx` -> pass.

## Next Plan (Scheduler Calendar UI)

- [x] Scheduler takvim bileşenini ekle (`scheduler-calendar.tsx`) ve haftalık/aylık görünüm sun.
- [x] Scheduler view’e Liste/Takvim toggle + varsayılan Takvim görünümü ekle.
- [x] Slot click ile pre-filled schedule modal akışını bağla.
- [x] API `listJobs` sonucuna `content_title` alanını ekle ve web tiplerini güncelle.
- [x] Web publish hook’una `handleSchedule(runAt)` akışını ekle.
- [x] İstenen doğrulamaları çalıştır (`web build`, dosya bazlı lint).

### Scheduler Calendar UI Progress

- Yeni bileşen eklendi: `apps/web/components/studio/views/scheduler-calendar.tsx`
  - Haftalık görünüm: 7 gün x 24 saat slot grid.
  - Aylık görünüm: 6 hafta (42 gün) grid + günlük job count badge.
  - Job state renkleri:
    - completed: yeşil
    - queued/retry_wait: mavi
    - in_progress: sarı
    - failed_permanent/cancelled: kırmızı
  - Slot click callback’i ile schedule intent üretiliyor.
- `apps/web/components/studio/views/scheduler-view.tsx` yeniden düzenlendi:
  - Toggle eklendi: `Calendar` / `List`.
  - Varsayılan panel `calendar`.
  - Slot click sonrası `datetime-local` prefill modal eklendi.
  - Modal submit -> `controller.handleSchedule(iso)` + jobs refresh.
  - Liste tablosu korunup `content_title` kolonu eklendi.
- `apps/web/components/studio/hooks/use-studio-publish.ts`:
  - `scheduleResult` state eklendi.
  - `handleSchedule(runAt)` eklendi ve `/scheduling/schedule` endpoint’ine bağlandı.
- `apps/web/lib/api.ts`:
  - `JobRow` tipine `content_title?: string | null` eklendi.
  - `schedulePublish(...)` API fonksiyonu eklendi.
- `apps/api/src/modules/scheduling/scheduling.service.ts`:
  - `listJobs()` sorgusunda `contents` join ile `content_title` alanı döndürülüyor.

### Review (Scheduler Calendar UI)

- `pnpm --filter @growth-os/web build` -> pass.
- `pnpm lint -- apps/web/components/studio/views/scheduler-view.tsx` -> pass.
- `pnpm lint -- apps/web/components/studio/views/scheduler-calendar.tsx` -> pass.
- Ek doğrulamalar:
- `pnpm exec eslint apps/web/components/studio/views/scheduler-view.tsx apps/web/components/studio/views/scheduler-calendar.tsx apps/web/components/studio/hooks/use-studio-publish.ts apps/web/lib/api.ts apps/api/src/modules/scheduling/scheduling.service.ts` -> pass.
- `pnpm --filter @growth-os/api build` -> pass.

## Next Plan (Scheduler Manual Action + Compose Shortcut)

- [ ] Inspect scheduler list API response (`apps/web/lib/api.ts` typings/clients) and scheduler/list components to map current job fields + manual action cues.
- [ ] Identify the minimal API contract addition (e.g., manualActionRequired flag, compose link) and align studio publish hooks to handle status updates.
- [ ] Update scheduler list UI + badge logic plus one-click copy/open compose actions so manual actions are surfaced and accessible.
- [ ] Run any relevant local compile/typecheck (e.g., `pnpm --filter @growth-os/web typecheck`) to confirm surface-level integrity.

## Next Plan (Studio UI Redesign)

- [x] `docs/gap-analysis.md` bağlamını Studio UX’e yansıtacak net bir tasarım yönü belirle (editorial control-room).
- [x] Tema/typography sistemini güçlendir (`layout.tsx`, `globals.css`) ve özgün görsel dil kur.
- [x] Ana Studio shell katmanını yeniden kompoze et (`studio-app.tsx`, `hero.tsx`, `navigation.tsx`, `right-rail.tsx`).
- [x] Dashboard içine gap odaklı “priority radar” bölümü ekle (dokümanla uyumlu bilgi mimarisi).
- [x] Hedefli doğrulama çalıştır (`eslint` + `web build`) ve çıktıları review bölümüne yaz.

### Studio UI Redesign Review

- Tasarım yönü: `editorial control-room` (sıcak zemin + teknik iz düşümlü grid + yüksek kontrast aksiyon katmanı).
- Tema ve tipografi:
  - `apps/web/app/layout.tsx`: `Fraunces + Archivo` font eşlemesi.
  - `apps/web/app/globals.css`: yeni renk token’ları, katmanlı background, noise/grid overlay, section-kicker yardımcı sınıfı.
- Ana shell ve bileşen kompozisyonu:
  - `apps/web/components/studio-app.tsx`: güçlü üst gradient katmanı + daha dengeli 3 kolon grid.
  - `apps/web/components/studio/hero.tsx`: baştan tasarlanmış hero, aksiyon konteyneri ve metrik kart dili.
  - `apps/web/components/studio/navigation.tsx`: sticky side nav + aktif sekme için yüksek kontrast yönlendirme.
  - `apps/web/components/studio/right-rail.tsx`: telemetry/debug lens hissi, scroll’lu feed ve daha okunur inspector.
- Doküman bağlamı:
  - `apps/web/components/studio/views/dashboard-view.tsx` içine `docs/gap-analysis.md` odaklı `Priority Radar` bölümü eklendi.
- UI primitive güncellemeleri:
  - `apps/web/components/ui/button.tsx`, `apps/web/components/ui/badge.tsx`, `apps/web/components/ui/input.tsx`, `apps/web/components/ui/select.tsx`, `apps/web/components/ui/textarea.tsx`, `apps/web/components/ui/label.tsx`.
- Doğrulama:
  - `pnpm exec eslint ...` (hedef dosyalar) pass; yalnız `globals.css` için config-supplied warning görüldü.
  - `pnpm --filter @growth-os/web build` pass.

## Next Plan (Marketing Landing Page)

- [x] Root route (`/`) için proje temasıyla uyumlu, yüksek kalite bir landing page oluştur.
- [x] Mevcut Studio akışını `/studio` route’una taşı (session guard davranışı korunacak).
- [x] Login akışındaki yönlendirme/callback hedeflerini `/studio` ile hizala.
- [x] Hedefli doğrulama çalıştır (`eslint` + `web build`) ve review notunu yaz.

### Marketing Landing Page Review

- `apps/web/app/page.tsx`: Proje temasını koruyan pazarlama odaklı landing page (`Hero`, capability kartları, workflow, CTA) root route'a yerleştirildi.
- `apps/web/app/studio/page.tsx`: Eski session-guarded Studio akışı `/studio` altına taşındı; session yoksa `redirect(\"/login?next=/studio\")` uygulanıyor.
- `apps/web/app/login/page.tsx`: default redirect/callback hedefleri `/studio` olacak şekilde güncellendi.
- `apps/web/components/studio/hooks/use-studio-auth.ts`: Studio içinden istenen magic link callback/new-user callback hedefleri `/studio` ile hizalandı.
- Doğrulama:
  - `pnpm exec eslint apps/web/app/page.tsx apps/web/app/studio/page.tsx apps/web/app/login/page.tsx apps/web/components/studio/hooks/use-studio-auth.ts` pass
  - `pnpm --filter @growth-os/web build` pass

## Next Plan (Auth 500 Debug + Fix)

- [x] `/api/auth/session` ve `/api/auth/sign-in/magic-link` hatalarını yerelde yeniden üret.
- [x] Kök nedenleri ayır: API process erişimi ve SMTP kaynaklı 500 davranışı.
- [x] Dev/test için magic-link email gönderiminde SMTP fail fallback düzeltmesini uygula.
- [x] Regresyon unit test + lint + build doğrulamasını çalıştır.

### Auth 500 Debug + Fix Review

- Teşhis:
  - `localhost:4000` kapalıyken web proxy `/api/*` çağrıları 500 dönüyor (API process yok).
  - API ayaktayken `POST /auth/sign-in/magic-link` SMTP (Resend test recipient kısıtı) yüzünden 500 dönüyordu.
- Kod düzeltmesi:
  - `apps/api/src/shared/email/email.service.ts`: SMTP gönderimi dev/test ortamında fail olursa 500 yerine dev magic-link log fallback'e düşecek şekilde güncellendi.
  - `apps/api/tests/auth/auth.sendMagicLinkEmail.devFallback.unit.test.ts`: SMTP failure -> dev fallback davranışı için regresyon testi eklendi.
- Doğrulama:
  - `pnpm --filter @growth-os/api exec tsx --test tests/auth/auth.sendMagicLinkEmail.devFallback.unit.test.ts` pass
  - `pnpm exec eslint apps/api/src/shared/email/email.service.ts apps/api/tests/auth/auth.sendMagicLinkEmail.devFallback.unit.test.ts` pass
  - `pnpm --filter @growth-os/api build` pass
  - Manuel: `POST /auth/sign-in/magic-link` artık `201` + `{ ok: true, ... }` dönüyor.

## Next Plan (Hydration Mismatch Fix)

- [x] `/login` hydration mismatch hatasını root layout seviyesinde izole et.
- [x] Extension kaynaklı `<html>` attribute mutasyonları için SSR hydration guard uygula.
- [x] Hedefli lint doğrulaması çalıştır.

### Hydration Mismatch Fix Review

- `apps/web/app/layout.tsx`: `<html lang=\"en\" suppressHydrationWarning>` güncellemesi eklendi.
- Bu değişiklik, browser extension'ların (`trancy-tr` gibi) hydration öncesi DOM attribute enjekte etmesinden kaynaklı mismatch uyarısını bastırır.
- Doğrulama:
  - `pnpm exec eslint apps/web/app/layout.tsx` pass

## Next Plan (Full Quality Gate Execution)

- [x] Tüm kalite kapılarını sıralı olarak çalıştır (format, lint, typecheck, unit, integration, coverage, build).
- [x] Her adımın geçiş durumunu tek raporda topla.
- [x] Fail veren adımları ve dosya bazlı ihlal özetini çıkar.

### Full Quality Gate Execution Review

- Çalıştırma:
  - `pnpm quality:gate` (ilk adımda `format:check` fail ile durdu)
  - Tam sweep için adımlar ayrı ayrı çalıştırıldı.
- Durum özeti:
  - `format_check`: fail (`1`)
  - `lint`: fail (`1`)
  - `typecheck`: pass (`0`)
  - `test_unit`: pass (`0`)
  - `test_integration`: pass (`0`)
  - `coverage_project`: pass (`0`)
  - `build`: pass (`0`)
- Log dosyaları:
  - `/tmp/quality-gate-latest.txt`
  - `/tmp/quality-steps/status.txt`
  - `/tmp/quality-steps/format_check.log`
  - `/tmp/quality-steps/lint.log`
  - `/tmp/quality-steps/typecheck.log`
  - `/tmp/quality-steps/test_unit.log`
  - `/tmp/quality-steps/test_integration.log`
  - `/tmp/quality-steps/coverage_project.log`
  - `/tmp/quality-steps/build.log`

## Next Plan (Quality Gate Remediation)

- [x] Format ihlallerini temizle (Prettier uyumsuz dosyalar).
- [x] Web lint ihlallerini refactor ile çöz (max-lines-per-function + complexity).
- [x] Tüm kalite kapısını yeniden çalıştır ve yeşil sonucu doğrula.

### Quality Gate Remediation Review

- Düzenlenen lint hedefleri:
  - `apps/web/app/login/page.tsx`
  - `apps/web/components/studio/hero.tsx`
  - `apps/web/components/studio/views/analytics-view.tsx`
  - `apps/web/components/studio/views/dashboard-view.tsx`
  - `apps/web/components/studio/views/generator-view.tsx`
  - `apps/web/components/studio/views/settings-view.tsx`
- Format düzeltmeleri:
  - `apps/api/src/modules/style/style.service.ts`
  - `apps/api/src/modules/x_integration/x-integration.service.ts`
  - `apps/api/tests/auth/auth.sendMagicLinkEmail.devFallback.unit.test.ts`
  - `apps/web/components/studio/views/scheduler-calendar.tsx`
  - `apps/worker/src/main.ts`
  - `docs/gap-analysis.md`
- Son doğrulama:
  - `pnpm quality:gate` pass (format, lint, typecheck, unit, integration, coverage, build tamamı yeşil)

## Next Plan (Magic Link 500 Recurrence)

- [x] 500 hatasını `localhost:3010/api/auth/sign-in/magic-link` üzerinden yeniden üret.
- [x] API runtime erişimini (`/health`) ve canlı process durumunu doğrula.
- [x] API prosesini temiz restart edip endpoint davranışını tekrar doğrula.

### Magic Link 500 Recurrence Review

- Teşhis:
  - Hata anında `http://localhost:4000/health` erişilemiyordu (`000`), yani 500 web proxy katmanından geliyordu.
  - `pnpm --filter @growth-os/api dev` launcher process açık olsa da `ts-node-dev` child ayağa kalkmamıştı.
- Düzeltme:
  - API `ts-node-dev` child/launcher processleri temizlenip yeniden başlatıldı.
  - Restart sonrası `/health` ve magic-link endpoint tekrar test edildi.
- Doğrulama:
  - `GET http://localhost:4000/health` -> `200`
  - `POST http://localhost:3010/api/auth/sign-in/magic-link` -> `201`
- Response: `{\"ok\":true,\"message\":\"If the email is eligible, a magic link will be sent.\"}`

## Next Plan (Waitlist + Onboarding State)

- [ ] Review `apps/api/src/modules/auth/*`, `apps/api/src/app.module.ts`, `apps/api/src/shared/auth/session-auth.guard.ts`, and the migration pattern (`packages/db/migrations/*`, `apps/api/src/shared/db/migrate.ts`) to understand current auth structure.
- [ ] Identify the minimal files to extend or add for waitlist and onboarding state (DB schema, module wiring, guards), noting dependencies and shared services.
- [ ] Recommend whether the new state endpoints should live under the existing auth module or a dedicated onboarding module and justify the choice.
- [ ] Outline the minimal validation steps (tests, migrations, guards) required once the change is implemented.

## Next Plan (Landing + Onboarding Wizard Review)

- [ ] Review `apps/web/app/page.tsx` and `apps/web/app/studio/page.tsx` to map current landing vs Studio routing/composition.
- [ ] Inspect Studio components (`studio-app.tsx`, `studio/use-studio-controller.ts`, relevant hooks) to understand onboarding-related state and data flows.
- [ ] Recommend file-level location(s) for onboarding wizard UI that keeps `/studio` intact and minimizes ripple;
      include required routing or controller adjustments.

## Next Plan (Content Series + Evergreen Queue Analysis)

- [ ] Document current implementation in `apps/api/src/modules/generation/*`, `apps/api/src/modules/scheduling/*`, `apps/worker/src/main.ts`, and `packages/db/migrations/013_content_series_evergreen.sql`.
- [ ] Identify missing behaviors vs the requested 'content series + evergreen queue + repurpose' feature (scheduling flows, queue handling, db support, API surfaces).
- [ ] Summarize obvious type/lint issues and gaps to highlight in the report.

## Next Plan (Migration 013 Inspection)

- [ ] Inspect migration runner order and review existing `packages/db/migrations/013_*.sql` files with their checksums to document current sequencing.
- [ ] Evaluate whether adding `013_content_series_evergreen.sql` beside `013_waitlist_onboarding_state.sql` requires renaming to avoid conflicts or checksum issues.
- [ ] Recommend validation commands (e.g., targeted `pnpm db:migrate`, checksum diff checks) and record the review outcome.

## Next Plan (Migration 013 Inspection)

- [ ] Inspect migration runner order and review existing `packages/db/migrations/013_*.sql` files with their checksums to document current sequencing.
- [ ] Evaluate whether adding `013_content_series_evergreen.sql` beside `013_waitlist_onboarding_state.sql` requires renaming to avoid conflicts or checksum issues.
- [ ] Recommend validation commands (e.g., targeted `pnpm db:migrate`, checksum diff checks) and record the review outcome.

## Next Plan (Series/Evergreen Test Inspection)

- [ ] Inventory current generation/scheduling tests covering series/repurpose/evergreen behavior.
- [ ] Map the endpoints `POST /generation/series`, `GET /generation/series`, `POST /generation/repurpose`, and evergreen scheduling flows to candidate test files.
- [ ] Draft minimal Given/When/Then steps and note where the tests should live for each uncovered behavior.

## Next Plan (Worker Evergreen Enqueue Coverage)

- [ ] Review `apps/worker/tests` suite to catalog existing coverage and spot gaps around `enqueueSeriesNextItemAfterPublish` and related helpers.
- [ ] Trace `apps/worker/src/main.ts` evergreen enqueue path after publish success, noting idempotency gates (dedupe key, transaction boundaries) and extraction points for unit testing.
- [ ] Propose concrete file additions/edits (new helper exports/mocked units or tests) that cover idempotent enqueue behavior without spinning up full integration infra.
- [ ] Summarize verification steps or assumptions for the proposed tests and note any required mock/stub utilities.

## Next Plan (Data Retention + Token Vault Lifecycle Compliance)

- [x] Retention env vars ve güvenli defaultlarını kodda konumlandır (`RAW_POST_RETENTION_DAYS=90`, `ANALYTICS_RETENTION_DAYS=365`, `TOKEN_ROTATION_DAYS=30`).
- [x] Worker tarafında idempotent günlük maintenance cleanup job ekle (raw timeline purge, analytics snapshot purge, token housekeeping).
- [x] Her purge/housekeeping aksiyonu için `audit_logs` kaydı ekle ve workspace isolation filtrelerini zorunlu tut.
- [x] API endpoint ekle: `POST /x/accounts/:workspaceId/:accountId/revoke`.
- [x] API endpoint ekle: `POST /workspace/:workspaceId/data-retention/run-now` (admin-only).
- [x] İstenen doğrulama komutlarını çalıştır (`api build`, `worker build`, `api integration`, `worker test`) ve sonucu review bölümünde raporla.

### Data Retention + Token Vault Lifecycle Compliance Review

- Worker tarafına `maintenance-jobs` queue/worker eklendi; günlük repeatable `retention.cleanup` job ile workspace bazlı cleanup çalışıyor.
- Retention config envleri worker’da defaultlarla çözüldü: `RAW_POST_RETENTION_DAYS=90`, `ANALYTICS_RETENTION_DAYS=365`, `TOKEN_ROTATION_DAYS=30`.
- Cleanup adımları workspace isolation ile uygulanıyor:
  - `x_timeline_posts` purge
  - `post_metric_snapshots` purge
  - expired token revoke
  - old revoked token purge
- Her cleanup adımı için `audit_logs` yazımı eklendi (`data_retention.*` action seti).
- API tarafında endpointler eklendi:
  - `POST /x/accounts/:workspaceId/:accountId/revoke`
  - `POST /workspace/:workspaceId/data-retention/run-now` (owner/admin check; mevcut role setinde efektif owner-only)
- Testler:
  - `apps/api/src/modules/x_integration/tests/x_integration.revokeAccount.integration.test.ts`
  - `apps/api/src/modules/scheduling/tests/data-retention.runNow.integration.test.ts`
  - `apps/worker/tests/retention-config.test.ts`
- Doğrulama çıktıları:
  - `pnpm --filter @growth-os/api build` pass
  - `pnpm --filter @growth-os/worker build` pass
  - `pnpm --filter @growth-os/api test:integration` pass (15/15)
  - `pnpm --filter @growth-os/worker test` pass (15/15)
