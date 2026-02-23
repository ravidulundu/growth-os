# Runbook: Token Revoke/Refresh Incident

## Ne Zaman Calistirilir

- X API auth failure alarmi (Alert A2)
- Kullanici publish denemelerinde auth hatasi aliyor
- Refresh token gecersiz/revoked sinyali var

## Hizli Triage

1. Hata kodlarina bak (`X_AUTH_FAILED`, `TOKEN_REFRESH_FAILED`, `TOKEN_REVOKED`).
2. Etkilenen workspace/account sayisini cikar.
3. Son basarili `x.connect` veya refresh event zamanini kontrol et.

SQL:

```sql
SELECT workspace_id,
       metadata->>'code' AS code,
       COUNT(*) AS failure_count
FROM audit_logs
WHERE action IN ('publish.failed_permanent', 'x.connect', 'x.token_refresh')
  AND result = 'failure'
  AND created_at >= now() - interval '60 minutes'
GROUP BY 1, 2
ORDER BY failure_count DESC;
```

## Containment

1. Etkilenen account'lar icin yeni publish schedule olusturmayi gecici durdur.
2. Gerekirse ilgili account'i pasiflestir (`x_accounts.is_active = false`) ve kullaniciyi reconnect'e yonlendir.

## Recovery (MVP-0 Uyumlu)

1. Kullaniciya yeniden X baglantisi (`/x/connect/start -> /x/connect/callback`) yaptir.
2. Yeni token yazildigini ve eski token'in revoke oldugunu dogrula.
3. Tek bir kontrollu publish ile akis testi yap.

SQL:

```sql
SELECT xa.id AS account_id,
       xa.workspace_id,
       xa.is_active,
       xt.revoked_at,
       xt.expires_at,
       xt.created_at
FROM x_accounts xa
LEFT JOIN LATERAL (
  SELECT *
  FROM x_tokens
  WHERE account_id = xa.id
  ORDER BY created_at DESC
  LIMIT 1
) xt ON TRUE
WHERE xa.workspace_id = $1;
```

## Dogrulama

- Yeni auth denemeleri basarili
- Auth failure alarmi normalize
- Publish success rate geri donmus

## Post-Incident

- Kök neden: scope degisikligi / revoke / config yanlisi
- Gerekliyse reconnect UX ve hata mesaji iyilestirme issue'su ac
