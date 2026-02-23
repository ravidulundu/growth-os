# Faz 7 - Staging/Prod Stabilizasyon + Izleme

## Amac ve Kapsam

Bu fazin hedefi, production guvenilirligini korurken kritik publish akisinda olasi kayiplari ve degisik X API davranislarini operasyonel olarak yonetebilmektir.

Odak metrikleri:

- publish success rate
- queue latency
- 429/backoff yogunlugu
- token refresh basarisi (MVP-0'da reconnect proxy metrik)

## Teslimatlar (Deliverables)

### 1) Observability Dashboard

Dashboard panel seti ve SQL sorgulari:

- Publish success rate (5m/15m/60m)
- Queue latency (p50/p95)
- 429/backoff sayisi
- Token refresh basarisi (audit event bazli)

Referans:

- `docs/engineering/observability-and-alerting.md`
- `docs/runbooks/sql/observability-dashboard.sql`

### 2) Alerting

Kurallar:

- publish failure spike
- X API auth failures
- 429 saturation (rate-limit baskisi)

Alert esitigi ve escalation kurallari:

- `docs/engineering/observability-and-alerting.md`

### 3) Runbook Seti

- `docs/runbooks/429-recovery.md`
- `docs/runbooks/token-revoke-refresh.md`
- `docs/runbooks/publish-duplication-incident.md`

## Zaman Cizelgesi / Milestone'lar

### Gun 25-30

- Staging soak test: 24-72 saat
- Publish/scheduler/metrics worker stabilite takibi
- Alert noise tuning
- Limited users ile minimal prod release

### Sonraki 2 Hafta

- KPI trendlerine gore threshold/UX iterasyonu
- False positive azaltma
- Oncall playbook netlestirme

## Operasyonel Kabul Kriterleri

- 24 saatlik pencerede publish success rate >= %95
- Queue latency p95 <= 5 dakika (scheduled publish akisinda)
- 429 kaynakli permanent failure oraninda artis yok
- Token revoke olaylarinda runbook ile 30 dakika icinde recoverable durum
- Publish duplication incidentlerinde containment <= 15 dakika

## Riskler ve Bagimliliklar

### Riskler

- X API limit/policy degisiklikleri
- Beklenmeyen auth davranislari (token revoke, scope degisimi)
- Yanlis otomasyon nedeniyle policy sikayetleri

### Bagimliliklar

- Sentry (error tracking)
- PostHog veya benzeri event dashboard (opsiyonel)
- DB/queue metriklerini okuyabilen dashboard altyapisi
- Dogru event enstrumantasyonu (`audit_logs`, `publish_jobs`, `post_metric_snapshots`)

## Notlar

- MVP-0'da tam otomatik refresh lifecycle'i sinirli olabilir. Bu nedenle token refresh KPI'i, gecis asamasinda `x.connect` ve auth failure trendleri ile birlikte yorumlanmalidir.
- Human-in-the-loop ve safe-mode prensibi korunmalidir.
