-- Faz 7 dashboard query seti
-- Parametreli kullanim icin dashboard araci tarafinda workspace filtreleri eklenebilir.

-- 1) Publish success rate (last 60m)
SELECT
  COUNT(*) FILTER (WHERE state = 'completed') AS completed_count,
  COUNT(*) FILTER (WHERE state = 'failed_permanent') AS failed_permanent_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE state = 'completed')
    / NULLIF(COUNT(*) FILTER (WHERE state IN ('completed', 'failed_permanent')), 0),
    2
  ) AS success_rate_pct
FROM publish_jobs
WHERE updated_at >= now() - interval '60 minutes'
  AND state IN ('completed', 'failed_permanent');

-- 2) Queue latency p50/p95 (completed jobs, last 24h)
SELECT
  ROUND(
    percentile_cont(0.50) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (completed_at - run_at))
    )::numeric,
    2
  ) AS latency_p50_sec,
  ROUND(
    percentile_cont(0.95) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (completed_at - run_at))
    )::numeric,
    2
  ) AS latency_p95_sec,
  COUNT(*) AS sample_count
FROM publish_jobs
WHERE state = 'completed'
  AND completed_at IS NOT NULL
  AND run_at >= now() - interval '24 hours';

-- 3) 429/backoff count (last 15m and 60m)
SELECT
  COUNT(*) FILTER (WHERE created_at >= now() - interval '15 minutes') AS rate_limit_15m,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '60 minutes') AS rate_limit_60m
FROM audit_logs
WHERE action = 'publish.retry_scheduled'
  AND metadata->>'code' = 'RATE_LIMIT';

-- 4) Token refresh success (last 24h)
-- Not: MVP-0'da x.token_refresh event'i henuz sinirli olabilir.
SELECT
  COUNT(*) FILTER (WHERE action = 'x.token_refresh' AND result = 'success') AS token_refresh_success,
  COUNT(*) FILTER (WHERE action = 'x.token_refresh' AND result = 'failure') AS token_refresh_failure,
  COUNT(*) FILTER (WHERE action = 'x.connect' AND result = 'success') AS x_connect_success_proxy,
  COUNT(*) FILTER (WHERE action = 'x.connect' AND result = 'failure') AS x_connect_failure_proxy
FROM audit_logs
WHERE created_at >= now() - interval '24 hours'
  AND action IN ('x.token_refresh', 'x.connect');

-- 5) Publish failure spike detector window (last 15m)
SELECT
  COUNT(*) FILTER (WHERE state = 'failed_permanent') AS failed_permanent_15m,
  COUNT(*) FILTER (WHERE state = 'completed') AS completed_15m,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE state = 'failed_permanent')
    / NULLIF(COUNT(*) FILTER (WHERE state IN ('completed', 'failed_permanent')), 0),
    2
  ) AS failure_ratio_pct_15m
FROM publish_jobs
WHERE updated_at >= now() - interval '15 minutes'
  AND state IN ('completed', 'failed_permanent');
