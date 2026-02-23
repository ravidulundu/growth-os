# Observability ve Alerting Standardi

Bu dokuman Faz 7 kapsaminda staging/prod izleme standardini tanimlar.

## Veri Kaynaklari

- PostgreSQL: `publish_jobs`, `published_posts`, `post_metric_snapshots`, `audit_logs`, `usage_events`
- BullMQ/Redis: queue bekleme ve islenme davranisi
- Uygulama loglari: `apps/worker/src/main.ts`, `apps/api/src/modules/*`

## Dashboard Panelleri

Panel SQL ornekleri:

- `docs/runbooks/sql/observability-dashboard.sql`

### 1) Publish Success Rate

Tanim:

- Basarili publish / (basarili + permanent failure)
- Pencereler: 5m, 15m, 60m

Kaynak:

- `publish_jobs.state IN ('completed', 'failed_permanent')`

### 2) Queue Latency

Tanim:

- `completed_at - run_at` gecikmesi
- p50 ve p95 takip edilir

Kaynak:

- `publish_jobs` (sadece `state = 'completed'`)

### 3) 429 / Backoff Yogunlugu

Tanim:

- `publish.retry_scheduled` audit event icinde `metadata.code = 'RATE_LIMIT'`
- Son 15 dk ve 60 dk toplam

Kaynak:

- `audit_logs.action = 'publish.retry_scheduled'`

### 4) Token Refresh Basarisi

Tanim:

- `x.token_refresh` basari/failure orani

Durum:

- MVP-0'da full refresh lifecycle event'i kisitli olabilir.
- Gecis KPI: `x.connect` success/failure ve auth hatalari birlikte izlenir.

Kaynak:

- `audit_logs.action IN ('x.token_refresh', 'x.connect')`

## Alert Kurallari

### Alert A1 - Publish Failure Spike

Kosul:

- 15 dakikada `failed_permanent >= 10`
- veya 15 dakikada failure ratio > %5

Aksiyon:

- Sev-2 incident ac
- `docs/runbooks/429-recovery.md` ve `docs/runbooks/publish-duplication-incident.md` ile hizli triage

### Alert A2 - X API Auth Failures

Kosul:

- Son 10 dakikada auth/revoke/refresh kaynakli hata >= 3

Ornek kodlar:

- `TOKEN_REFRESH_FAILED`
- `X_AUTH_FAILED`
- `TOKEN_REVOKED`

Aksiyon:

- Sev-2 incident ac
- `docs/runbooks/token-revoke-refresh.md` uygula

### Alert A3 - 429 Saturation

Kosul:

- Son 15 dakikada RATE_LIMIT retry >= 20
- ve ayni pencerede publish success rate < %90

Aksiyon:

- Sev-2 incident
- publish hizini dusur, retry/backoff davranisini gozden gecir

## SLO/SLI Onerisi

- SLI-1 Publish Success Rate (24h): >= %95
- SLI-2 Queue Latency p95 (24h): <= 5 dakika
- SLI-3 429 kaynakli permanent failure (24h): <= %1
- SLI-4 Token auth recoverability: revoke olayinda <= 30 dakika

## Instrumentation Referansi

- Publish state transitions: `apps/worker/src/main.ts`
- Retry/failure audit eventleri: `apps/worker/src/main.ts`
- X connect ve token saklama: `apps/api/src/modules/x_integration/x-integration.service.ts`

## Ops Notlari

- Alert threshold'lari staging soak test sonuclarina gore tune edilmelidir.
- İlk 2 hafta boyunca false-positive oranina gore A2/A3 esikleri yeniden ayarlanir.
