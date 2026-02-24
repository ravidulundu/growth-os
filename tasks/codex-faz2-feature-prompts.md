# Codex Prompts — Faz 2: Ürünleşme ve Beta Hazırlığı

> Kaynak: `docs/deep-research-report(1).md`
> Faz1’deki 5 başlık (token refresh, style LLM enrichment, charting, scheduler calendar, first-hour delivery) tamamlandı kabul edilerek kalan ürünleşme boşlukları prompt’a çevrildi.
> Tech stack: NestJS 11 + Fastify 5 + PostgreSQL 16 + BullMQ 5 + Next.js 16 + React 19

---

## 1. Stripe Paywall + Plan Entitlement Sistemi

```
Proje: NestJS API + Next.js Web (billing/productization)
Durum:
  - Billing metering var: apps/api/src/modules/billing/billing.service.ts
  - Billing endpoint var: GET /billing/metering/:workspaceId
  - Web settings metering gösteriyor: apps/web/components/studio/views/settings-view.tsx
  - Stripe entegrasyonu YOK (API/Web kodunda stripe importu yok)

GERÇEK EKSİK:
  - Plan yükseltme/ödeme akışı yok
  - Subscription state ile entitlement bağlanmıyor
  - Paywall olmadan kredi/limit modeli satışa dönüşmüyor

Yapılacaklar:

1. Stripe altyapısı:
   - apps/api içine stripe SDK ekle
   - env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID_* tanımları

2. DB migration:
   - packages/db/migrations/012_billing_subscriptions.sql
   - tablolar:
     - billing_customers (workspace_id, stripe_customer_id)
     - billing_subscriptions (workspace_id, stripe_subscription_id, plan_key, status, period_end_at)
     - billing_invoices (workspace_id, stripe_invoice_id, amount_cents, status, hosted_invoice_url)
   - gerekli unique/index ve workspace FK’leri

3. API endpoint’leri:
   - POST /billing/checkout-session (workspaceId, planKey)
   - POST /billing/portal-session (workspaceId)
   - POST /billing/webhook (signature verify zorunlu)
   - webhook event’leri:
     - checkout.session.completed
     - customer.subscription.updated
     - customer.subscription.deleted
     - invoice.paid / invoice.payment_failed

4. Entitlement bağlantısı:
   - BillingService plan çözümlemesini DB subscription state + fallback default plan ile yap
   - Generation limit enforcement mevcut davranışını koruyup plan kaynağını subscription’dan alsın

5. Web UI:
   - settings-view’e plan kartları (Free/Creator/Growth/Team)
   - “Upgrade” butonu checkout-session URL’e yönlendirsin
   - Aktif plan + renewal + fatura linkleri görünsün

Kısıtlar:
  - Mevcut /billing/metering API’sini bozma
  - Stripe webhook idempotent olmalı (aynı event iki kez işlenmemeli)
  - Free plan fallback her zaman çalışmalı (Stripe down olsa da ürün tamamen kilitlenmesin)

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/web build
  pnpm --filter @growth-os/api test:unit
  pnpm --filter @growth-os/api test:integration
```

---

## 2. İçerik Serisi + Evergreen Queue + Repurpose Akışı

```
Proje: API generation/scheduling + Web library/scheduler
Durum:
  - Tekil içerik üretim + schedule var
  - prompt_templates var (migration 008), ama content series/evergreen akışı yok
  - Scheduler takvim/liste gösteriyor, seri otomasyon yok

GERÇEK EKSİK:
  - “Evergreen queue” ve “content series” ürün akışı yok
  - Yayınlanmış içerikten repurpose üretimi yok

Yapılacaklar:

1. DB migration:
   - packages/db/migrations/013_content_series_evergreen.sql
   - tablolar:
     - content_series (workspace_id, account_id, name, cadence, is_active)
     - content_series_items (series_id, content_id, position, state)
     - repurpose_runs (workspace_id, source_content_id, target_type, status, metadata)

2. API:
   - generation controller/service:
     - POST /generation/series
     - GET /generation/series/:workspaceId/:accountId
     - POST /generation/repurpose
   - scheduling service:
     - enqueueSeriesNextItem(seriesId) helper
     - yayın sonrası sıradaki item’i queue’ya alma (opsiyonel flag ile)

3. Worker entegrasyonu:
   - publish success sonrasında evergreen aktifse sıradaki item’i schedule et
   - idempotency: aynı series item aynı slotta iki kez enqueue edilmemeli

4. Web UI:
   - library view: “Series” sekmesi
   - scheduler view: “Evergreen active” badge + sonraki içerik
   - generator view: “Repurpose this draft/post” aksiyonu

Kısıtlar:
  - Mevcut draft/version API davranışlarını değiştirme
  - Scheduler’ın mevcut publish-now ve schedule endpoint’leri backward compatible kalmalı
  - Seri otomasyon varsayılan kapalı gelsin (kullanıcı explicit açsın)

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/web build
  pnpm --filter @growth-os/api test:unit
```

---

## 3. Rakip Analizi (Competitor Pattern Panel)

```
Proje: Analytics modülü + Studio analytics ekranı
Durum:
  - Analytics sadece kendi content/snapshot metriklerini gösteriyor
  - “Rakip hesap pattern analizi” endpoint/UI yok
  - deep-research raporunda competitor paneli öneriliyor

GERÇEK EKSİK:
  - Rakip hesap postlarını çekip hook pattern ve performans dağılımı çıkaran akış yok

Yapılacaklar:

1. DB migration:
   - packages/db/migrations/014_competitor_analytics.sql
   - tablolar:
     - competitor_accounts (workspace_id, platform, handle, x_user_id, is_active)
     - competitor_post_snapshots (competitor_account_id, x_post_id, metrics_json, captured_at)

2. API:
   - analytics controller/service:
     - POST /analytics/competitors/:workspaceId/add
     - GET /analytics/competitors/:workspaceId/overview
   - x_integration service:
     - competitor timeline ingest helper (read-only)
   - pattern çıktısı:
     - top hook types
     - posting windows (hourly)
     - best performing post examples

3. Web:
   - analytics-view’e “Competitor Insights” section
   - rakip hesap ekleme formu + summary kartları + örnek post listesi

Kısıtlar:
  - Sadece read-only analytics; rakip hesaplar için hiçbir publish/autopilot yok
  - Workspace isolation zorunlu (bir workspace diğerinin competitor listesini göremez)
  - API rate limit’e saygılı batch ingest tasarımı yap

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/web build
  pnpm --filter @growth-os/api test:integration
```

---

## 4. Publish Fallback: Copy-to-X + Reminder Akışı

```
Proje: Scheduling + Worker + Web UX
Durum:
  - Publish başarısızlıkları job state/error ile tutuluyor
  - Otomasyon fallback olarak manuel “copy-to-x / reminder” akışı yok

GERÇEK EKSİK:
  - 429/policy/auth gibi hatalarda kullanıcıyı manuel publish’e hızlı taşıyan UX yok
  - deep-research fallback önerileri (copy/export/reminder) implement edilmemiş

Yapılacaklar:

1. API:
   - scheduling service’e helper:
     - createManualPublishFallback(contentId, reasonCode)
   - endpoint:
     - POST /scheduling/manual-fallback
       response: composeUrl + plainText + reason
   - compose URL formatı: https://twitter.com/intent/tweet?text=...

2. Worker:
   - belirli hata sınıflarında fallback üret:
     - POLICY_REJECTED
     - RATE_LIMIT (eşik üstü tekrar)
     - AUTH_FAILED (refresh sonrası da başarısız)
   - publish job state: failed + requires_manual_action metadata

3. Reminder:
   - mevcut email altyapısını kullanarak “manual publish reminder” e-postası (opsiyonel)
   - duplicate reminder engeli (idempotency key)

4. Web:
   - scheduler/listede “Manual action required” badge
   - tek tık:
     - metni clipboard’a kopyala
     - compose URL aç

Kısıtlar:
  - Mevcut otomatik publish davranışını bozmadan sadece fallback katmanı ekle
  - Fallback sadece belirli hata kodlarında tetiklensin
  - Kullanıcı metni değiştirebilmeli; otomatik publish’e zorlanmamalı

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/web build
  pnpm --filter @growth-os/worker test
```

---

## 5. Ürün İzleme: Sentry + PostHog + KPI Telemetry

```
Proje: API + Web + ürün analitiği
Durum:
  - Request correlation ID altyapısı var
  - Merkezî hata izleme (Sentry) ve ürün event analitiği (PostHog) yok
  - North-star / funnel KPI eventleri sistematik toplanmıyor

GERÇEK EKSİK:
  - Beta sonrası incident ve product feedback döngüsü için telemetry eksik

Yapılacaklar:

1. Sentry entegrasyonu:
   - apps/api ve apps/web’e Sentry init
   - env: SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_RELEASE
   - API’de exception filter veya global hook ile capture
   - requestId ve workspaceId context’i tag olarak ekle

2. PostHog event şeması:
   - kritik eventler:
     - x_connect_started/completed
     - style_extracted
     - draft_generated
     - scheduled
     - published
     - first_hour_alert_triggered
   - apps/web’de user action eventleri
   - apps/api’de server-side event (kritik işlemler)

3. KPI endpoint:
   - GET /analytics/kpi/:workspaceId?range=7d
   - çıktı:
     - draft_to_publish_rate
     - first_hour_success_rate
     - policy_risk_rate (duplicate/rate-limit hit)
     - time_to_first_value

4. Web panel:
   - dashboard veya settings içine “KPI Snapshot” kartları

Kısıtlar:
  - PII sızıntısı olmamalı (token/email gibi alanları event payload’a koyma)
  - Telemetry failure uygulama akışını kırmamalı (fire-and-forget + safe fallback)
  - Local dev’de telemetry opsiyonel olmalı

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/web build
  pnpm --filter @growth-os/api test:unit
```

---

## 6. Onboarding + Landing + Waitlist + Demo Workspace

```
Proje: Next.js web ürünleşme yüzeyi
Durum:
  - /login ve /studio akışı var
  - Landing + waitlist + onboarding wizard eksik
  - Demo data ile “time-to-first-value” hızlandırma akışı yok

GERÇEK EKSİK:
  - Ürünü dış kullanıcıya anlatan landing yok
  - Login sonrası yönlendirmeli onboarding olmadığı için ilk kullanım karmaşık

Yapılacaklar:

1. Landing page:
   - apps/web/app/page.tsx’i marketing landing + CTA (Get Started / Join Waitlist) olacak şekilde düzenle
   - Studio uygulamasını /studio route’unda koru

2. Waitlist:
   - API endpoint: POST /auth/waitlist (veya /marketing/waitlist)
   - tablo: waitlist_entries (email, source, created_at)
   - basic duplicate email koruması

3. Onboarding wizard:
   - adımlar:
     1) workspace doğrulama
     2) X connect
     3) timeline ingest
     4) style extract
     5) first draft generate
   - onboarding state local+server olarak tutulmalı (resume edilebilir)

4. Demo workspace:
   - demo seed endpoint veya local fixture
   - yeni kullanıcı için boş ekran yerine örnek analytics/generator data gösterimi

Kısıtlar:
  - Mevcut login/magic-link akışını bozma
  - /studio URL ve mevcut Studio controller API’si korunmalı
  - Onboarding tamamlanmadan kullanıcı yine de manuel olarak studio’ya geçebilsin (hard lock yapma)

Doğrulama:
  pnpm --filter @growth-os/web build
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/web test:e2e
```

---

## 7. Veri Saklama ve Token Vault Yaşam Döngüsü (Compliance)

```
Proje: API + Worker + DB lifecycle
Durum:
  - Token encryption var, refresh/revoke akışları var
  - Ancak retention/purge politikaları kodda sistematik uygulanmıyor
  - Ham tweet saklama, snapshot retention, token rotation policy otomatik değil

GERÇEK EKSİK:
  - deep-research’te önerilen 90g raw post / 12ay analytics retention ve lifecycle job’ları eksik

Yapılacaklar:

1. Retention config:
   - env:
     - RAW_POST_RETENTION_DAYS (default 90)
     - ANALYTICS_RETENTION_DAYS (default 365)
     - TOKEN_ROTATION_DAYS (default 30, opsiyonel)

2. Worker maintenance job:
   - günlük çalışacak cleanup job:
     - eski raw post/timeline kayıtları purge
     - eski analytics snapshotları aggregate + purge (veya soft-delete)
     - expired/revoked token housekeeping

3. API yönetim endpoint’leri:
   - POST /x/accounts/:workspaceId/:accountId/revoke
   - POST /workspace/:workspaceId/data-retention/run-now (admin only)

4. Audit:
   - her purge/revoke işlemini audit_logs’a yaz

Kısıtlar:
  - Varsayılan davranış geriye uyumlu olmalı (env yoksa güvenli default)
  - Cleanup job idempotent olmalı
  - Veri silme operasyonlarında workspace isolation garanti edilmeli

Doğrulama:
  pnpm --filter @growth-os/api build
  pnpm --filter @growth-os/worker build
  pnpm --filter @growth-os/api test:integration
  pnpm --filter @growth-os/worker test
```

---

## Çalıştırma Sırası (Faz 2 Öneri)

1. **#1 Stripe paywall + entitlement** (ticari temel)
2. **#6 Onboarding/landing/waitlist** (aktivasyon ve funnel)
3. **#5 Sentry + PostHog + KPI telemetry** (ölçmeden optimize etme)
4. **#2 Content series + evergreen + repurpose** (core ürün derinliği)
5. **#4 Manual fallback flows** (operasyonel güvenlik)
6. **#3 Competitor analytics panel** (farklılaştırıcı özellik)
7. **#7 Retention/token lifecycle compliance** (beta sonrası sertleştirme)
