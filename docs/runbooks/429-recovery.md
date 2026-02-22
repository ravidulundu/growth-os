# Runbook: 429 Recovery

## Ne Zaman Calistirilir

- Alert A3 tetiklenince (RATE_LIMIT spike)
- Publish success rate dusup retry backlog artisiyorsa

## Hizli Triage (Ilk 5 Dakika)

1. Son 15 dakikadaki RATE_LIMIT retry sayisini kontrol et.
2. Queue gecikmesi p95 degerini kontrol et.
3. Permanent failure oraninda artis var mi bak.

SQL:

```sql
SELECT COUNT(*) AS rate_limit_retries_15m
FROM audit_logs
WHERE action = 'publish.retry_scheduled'
  AND metadata->>'code' = 'RATE_LIMIT'
  AND created_at >= now() - interval '15 minutes';
```

```sql
SELECT
  COUNT(*) FILTER (WHERE state = 'completed') AS completed,
  COUNT(*) FILTER (WHERE state = 'failed_permanent') AS failed_permanent
FROM publish_jobs
WHERE updated_at >= now() - interval '15 minutes';
```

## Containment

1. Yeni schedule/publish taleplerini gecici yavaslat (UI veya API rate cap).
2. Worker concurrency'yi kontrollu sekilde dusur.
3. Backoff cap degerini kisa sureli yukari cek (deploy gerekiyorsa change ticket ac).

## Recovery

1. Kuyruktaki `retry_wait` job sayisini izleyerek normal seviyeye inisini dogrula.
2. 15 dakikalik pencerede success rate >= %90 olana kadar yakindan takip et.
3. Stabil oldugunda containment adimlarini geri al.

## Dogrulama

- RATE_LIMIT retry trendi dususte
- Queue latency p95 hedefe donmus
- Permanent failure trendi normalize

## Post-Incident

- Incident notu ac
- Eger tekrarli pattern varsa threshold/worker ayari icin issue ac
- `docs/engineering/observability-and-alerting.md` esiklerini guncelle
