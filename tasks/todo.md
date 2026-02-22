# Todo

## Plan

- [x] Coverage kapsamını mevcut durumdan çıkar (tek dosya yerine proje çekirdeği).
- [x] Proje geneli coverage scriptlerini tanımla (`api`, `shared`, `ui`, `worker`).
- [x] Root seviyede birleşik coverage komutu ekle.
- [x] Çalıştırıp sonuçları raporla, kalite kapılarına entegre et.
- [x] Gerekirse eşik/harici bırakma kararlarını açık ve savunulabilir şekilde düzelt.
- [x] API coverage düşük modülleri için integration test ekle (`analytics`, `style`, `generation`, `auth/better-auth`, `session guard`).
- [x] API coverage raporunu tekrar al ve 99 hedef gap'ini netleştir.

## Review

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

## Next Plan (PR Review Threads Closure)

- [x] Açık PR review thread listesini çıkar ve tekrar edenleri grupla
- [x] Kritik/aksiyon gerektiren yorumları kodda düzelt (`runtime-policy`, `session guard`, `auth map`, `smtp`, `queue`, `similarity`, `generation template`)
- [x] İlgili regresyon testlerini ekle/güncelle
- [x] Lint + typecheck + unit/integration doğrulamalarını çalıştır
- [ ] Tek commit + thread reply/resolve adımını tamamla

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
  - `pnpm --filter @growth-os/api typecheck` pass
  - `pnpm --filter @growth-os/worker typecheck` pass
  - `pnpm --filter @growth-os/shared typecheck` pass
