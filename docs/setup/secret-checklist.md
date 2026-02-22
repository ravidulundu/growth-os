# Secret Checklist

## Kaynak prensibi

- `.env.example`, `.env.staging.example`, `.env.production.example` sadece referans.
- Gerçek staging/prod değerleri **yalnızca secret manager** içinde tutulur.

## Secret Manager'da zorunlu olanlar

- `TOKEN_ENCRYPTION_KEY`
- `OPENROUTER_API_KEY`
- `X_CLIENT_SECRET`
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`

## Auth config (zorunlu, secret olmayabilir)

- `BETTER_AUTH_BASE_URL` (API origin; magic-link URL uretimi icin)
- `APP_URL` (web app origin; callback/redirect dogrulamasi icin)

## Local

- `.env` + gerekirse `.env.local` kullan.
- `.env.local` commit edilmez.
- Sandbox X app credentials kullan.

## Staging

- Prod'dan ayrı credential seti.
- En az 2 kişi erişim kontrolü (owner + backup).
- Deploy öncesi secret varlığı checklist ile doğrulanır.

## Production

- KMS-backed secret store tercih edilir.
- Least privilege IAM zorunlu.
- Audit log açık olmalı.

## Rotate Plan (MVP-1)

1. Anahtar versiyonlama: `key_v1`, `key_v2`, ...
2. Dual-read/single-write pencere:
   - Write: yeni anahtar
   - Read: yeni + eski anahtar fallback
3. Re-encrypt job:
   - Token/material satırlarını batch halinde yeni anahtarla şifrele
   - İlerleme ve hata oranı raporla
4. Eski anahtar decommission:
   - Re-encrypt tamamlandıktan sonra fallback kaldır
   - Secret manager'da eski versiyonu disable et
