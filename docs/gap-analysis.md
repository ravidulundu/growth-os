# Growth OS - Gap Analysis (Guncel)

> Tarih: 2026-02-24  
> Kaynak: `docs/deep-research-report(1).md` ile mevcut repo karsilastirmasi  
> Not: Bu belge onceki eski durum listesinin yerine guncel "kalan gercek gap" odakli olarak yenilendi.

---

## Durum Ozeti

| Alan                                                | Durum         | Not                                                    |
| --------------------------------------------------- | ------------- | ------------------------------------------------------ |
| X OAuth + publish + token refresh                   | ✅ Tamamlandi | Real client + refresh + revoke + retry/backoff aktif   |
| Style extraction + LLM enrichment                   | ✅ Tamamlandi | `writingPersonality` dahil                             |
| Generation (draft/version)                          | ✅ Tamamlandi | tweet/thread/reply/quote + template tabanli akış       |
| Series + evergreen + repurpose                      | ✅ Tamamlandi | API + worker + web akisi var                           |
| Scheduler + manual fallback                         | ✅ Tamamlandi | copy-to-X fallback ve manual action UX var             |
| Analytics + KPI + first-hour alert                  | ✅ Tamamlandi | chart, KPI, alert, webhook/email delivery var          |
| Competitor panel                                    | ✅ Tamamlandi | add + overview + web panel var                         |
| Billing/Stripe entitlement                          | ✅ Tamamlandi | checkout/portal/webhook + plan kartlari var            |
| Landing + waitlist + onboarding                     | ✅ Tamamlandi | root landing, waitlist endpoint, resume onboarding var |
| Telemetry (Sentry/PostHog)                          | ✅ Tamamlandi | API + web tarafinda PII-sanitize ve sampling var       |
| Security hardening (rate limit, helmet, request id) | ✅ Tamamlandi | global throttling + helmet + correlation id aktif      |
| Retention/compliance lifecycle                      | ✅ Tamamlandi | run-now endpoint + worker cleanup var                  |

---

## Tamamlanan Basliklar (Kanit Dosyalari)

- `POST /auth/waitlist` ve onboarding state:
  `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/auth-session.controller.ts`, `packages/db/migrations/015_waitlist_onboarding_state.sql`
- Landing + waitlist UI:
  `apps/web/app/page.tsx`, `apps/web/components/landing/landing-page.tsx`, `apps/web/components/landing/waitlist-form.tsx`
- Stripe altyapisi ve subscription sync:
  `apps/api/src/modules/billing/billing.controller.ts`, `apps/api/src/modules/billing/billing.service.ts`, `packages/db/migrations/012_billing_subscriptions.sql`
- Style LLM enrichment:
  `apps/api/src/modules/style/style.service.ts`, `packages/db/migrations/010_seed_style_prompt_template.sql`
- Recharts analytics UI:
  `apps/web/components/studio/views/analytics-charts.tsx`, `apps/web/components/studio/views/analytics-view.tsx`
- Scheduler calendar:
  `apps/web/components/studio/views/scheduler-calendar.tsx`
- Series/evergreen/repurpose:
  `apps/api/src/modules/generation/generation.controller.ts`, `apps/api/src/modules/scheduling/scheduling.service.ts`, `apps/worker/src/main.ts`, `packages/db/migrations/013_content_series_evergreen.sql`
- Competitor analytics:
  `apps/api/src/modules/analytics/analytics.controller.ts`, `apps/api/src/modules/analytics/analytics.service.ts`, `apps/web/components/studio/views/competitor-insights.tsx`, `packages/db/migrations/014_competitor_analytics.sql`
- Manual publish fallback:
  `apps/api/src/modules/scheduling/scheduling.controller.ts`, `apps/web/lib/api.ts`, `apps/web/components/studio/views/scheduler-view.tsx`
- Telemetry:
  `apps/api/src/shared/telemetry/api-telemetry.ts`, `apps/web/lib/telemetry.ts`
- API guvenlik sertlestirme:
  `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/shared/rate-limit/fastify-throttler.guard.ts`
- Retention + revoke lifecycle:
  `apps/api/src/shared/retention/data-retention.controller.ts`, `apps/api/src/shared/retention/data-retention.service.ts`, `apps/api/src/modules/x_integration/x-integration.controller.ts`, `apps/worker/src/main.ts`

---

## Kalan Gercek Gapler

## P0 (Yuksek Oncelik)

1. AI Coach sohbet modulu yok

- Deep-research hedefinde "AI Coach" ayrı urun akisiydi.
- Su an studio section listesinde ayri coach modulu yok:
  `apps/web/components/studio/use-studio-controller.ts`
- API tarafinda coach odakli endpoint/service yok (mevcut "reply-coach" sadece template isimlendirmesi seviyesinde testte geciyor):
  `apps/api/src/modules/generation/tests/generation.createDraftVersion.integration.test.ts`

2. Growth loops eksik (shareable profile + referral + community)

- Shareable/public analytics profile route/UI yok.
- Referral credit akisi yok.
- Community/showcase baglantili urun loop'u yok.
- Mevcut analytics route'lari kpi/snapshot/competitor ile sinirli:
  `apps/api/src/modules/analytics/analytics.controller.ts`

## P1 (Orta Oncelik)

1. Mentions ingest + mention-tabanli reply workflow eksik

- Deep-research'te mentions akisi hedeflenmis.
- X client'ta timeline ve handle-based fetch var, mentions fetch yok:
  `apps/api/src/modules/x_integration/x-client.ts`

2. "Best time to post" onerisi yok

- Scheduler calendar/list var, ancak predictive slot recommendation yok:
  `apps/web/components/studio/views/scheduler-view.tsx`

3. Team workflow genisletmeleri eksik

- Workspace/member temel yapisi var, ancak team plan seviyesi approval akisi ve gelismis seat yonetimi yok.
- Bu kisim daha cok "productization/team ops" backlog olarak duruyor.

4. Demo workspace/fixture akisi net degil

- Landing/onboarding var ama "tek tik demo workspace dolu veri" akisi belirgin degil.

## P2 (Dusuk Oncelik / Platform)

1. Deployment hardening backlog

- KMS-backed secret lifecycle, WAF, backup governance gibi production-operasyon adimlari dokumanda oneriliyor; repoda kod seviyesi kismi var ama full ops setup dokumante edilmemis.

2. Content library modulu adlandirma/konum temizligi

- API tarafinda `content_library` klasoru placeholder durumda:
  `apps/api/src/modules/content_library/README.md`
- Islevler generation/scheduling icinde calisiyor; modul sinirlari netlestirilebilir.

---

## Faz-2 Prompt Durumu (Guncel)

| Faz-2 Basligi                     | Durum |
| --------------------------------- | ----- |
| Stripe paywall + entitlement      | ✅    |
| Onboarding + landing + waitlist   | ✅    |
| Sentry + PostHog + KPI telemetry  | ✅    |
| Series + evergreen + repurpose    | ✅    |
| Publish fallback (copy-to-X)      | ✅    |
| Competitor pattern panel          | ✅    |
| Retention + token vault lifecycle | ✅    |

---

## Onerilen Sonraki Faz (Faz-3)

1. AI Coach (API + UI)
2. Growth loops (public analytics profile + referral credits)
3. Mentions ingest + mention-driven reply assist
4. Best-time recommendation engine (analytics bagli scheduler nudge)
5. Team approval/seat management ve enterprise-grade ops backlog (KMS/WAF/backup)
