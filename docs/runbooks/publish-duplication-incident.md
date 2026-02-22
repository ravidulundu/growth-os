# Runbook: Publish Duplication Incident

## Ne Zaman Calistirilir

- Ayni icerigin kisa surede birden fazla publish oldugu raporlanir
- Ayni/benzer post'un farkli `external_post_id` ile tekrarlandigi gorulur

## Hizli Triage

1. Son 2 saatte ayni `content_id` icin birden fazla publish var mi kontrol et.
2. Ayni account icin yakin zamanli metin benzerligi yuksek publish var mi kontrol et.
3. `publish_jobs` satiri var ama `published_posts` satiri yok durumlarini ayikla.
4. Incident alanini daralt: tek workspace mi genel mi?

SQL:

```sql
SELECT content_id,
       COUNT(*) AS publish_count,
       MIN(published_at) AS first_publish,
       MAX(published_at) AS last_publish
FROM published_posts
WHERE published_at >= now() - interval '2 hours'
GROUP BY content_id
HAVING COUNT(*) > 1
ORDER BY publish_count DESC, last_publish DESC;
```

```sql
SELECT account_id,
       COUNT(*) AS duplicated_external_id_count
FROM published_posts
WHERE published_at >= now() - interval '24 hours'
GROUP BY account_id, external_post_id
HAVING COUNT(*) > 1;
```

```sql
SELECT pj.id AS publish_job_id,
       pj.workspace_id,
       pj.account_id,
       pj.content_id,
       pj.state,
       pj.updated_at
FROM publish_jobs pj
LEFT JOIN published_posts pp ON pp.publish_job_id = pj.id
WHERE pj.updated_at >= now() - interval '24 hours'
  AND pp.id IS NULL
  AND pj.state IN ('in_progress', 'retry_wait', 'failed_permanent')
ORDER BY pj.updated_at DESC;
```

## Containment

1. Etkilenen workspace/account icin yeni publish enqueue islemlerini gecici durdur.
2. Manual review zorunlulugunu ac (`SAFE_MODE_ENABLED=true` zaten korunmali).
3. Gerekirse sadece tek account/tenant icin rollout freeze uygula.

## Recovery

1. Cift publish olusan icerikler icin incident kaydi ve audit notu ekle.
2. "X'te post var, DB'de yok" senaryosunda once X tarafini dogrula (external post id, yayin zamani, icerik eslesmesi).
3. Dogrulanan kayitlar icin manuel reconcile uygula:
   - `published_posts` satiri ekle/guncelle
   - ilgili `publish_jobs` satirini `completed` yap
   - `contents.status` degerini `published` yap
4. Tekrarlayan pattern varsa dedupe key üretimini ve enqueue yolunu incele.
5. Duzeltme sonrasi kontrollu tekli publish smoke testi yap.

Ornek manuel reconcile (degerleri incident'e gore doldur):

```sql
BEGIN;

INSERT INTO published_posts (
  workspace_id,
  account_id,
  content_id,
  publish_job_id,
  external_post_id,
  published_at
)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (publish_job_id)
DO UPDATE SET
  external_post_id = EXCLUDED.external_post_id,
  published_at = EXCLUDED.published_at;

UPDATE publish_jobs
SET state = 'completed',
    completed_at = COALESCE(completed_at, now()),
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
WHERE id = $1;

UPDATE contents
SET status = 'published',
    updated_at = now()
WHERE id = $3;

COMMIT;
```

## Dogrulama

- Son 1 saatte duplicate incident yeni kayit yok
- `publish_jobs` state akisi normal
- Dedupe conflict oranlari beklenen seviyede

## Post-Incident

- Root cause sinifi: queue race / idempotency key / dis bagimlilik davranisi
- Kalici aksiyon: regression test + alert tune + gerekiyorsa schema/index degisikligi
