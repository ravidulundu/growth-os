# Faz 5 — Geliştirme + Test (MVP-0 -> MVP-1 çekirdeği)

## Amaç ve Kapsam

- MVP-0: kişisel kullanımda “uçtan uca değer döngüsü”nü çalıştırmak:
  - X hesabını bağla -> style çıkar -> içerik üret -> schedule/publish -> metrics gör
- MVP-1: workspace/multi-account/credits/audit ile ürünleşmeye hazır çekirdeği kurmak.

## Teslimatlar (Deliverables)

### MVP-0

- X OAuth2 PKCE bağlantısı + token saklama (şifreli)
- Timelines çekimi + style_profile üretimi
- Tweet/Thread generator + draft/versioning
- Scheduler + publish worker (idempotent + backoff)
- Analytics snapshot (ilk 60 dk, 24h)

### MVP-1

- Workspace + role + multi-account
- Plan/credit metering (basit)
- Audit log
- Duplicate similarity check + “safe mode” (uyum odaklı)

## Zaman Çizelgesi / Milestone’lar

### Gün 1-7: MVP-0

- Gün 2: X OAuth2 PKCE
- Gün 3: Timeline ingest + DB
- Gün 4: Style extraction
- Gün 5: Generator + Library
- Gün 6: Scheduler + publish
- Gün 7: Analytics + QA

### Gün 8-30: MVP-1

- Gün 8-13: Multi-tenant + multi-account + token vault
- Gün 14-19: Template/evergreen + analytics v1 + first-hour alerting
- Gün 20-24: Safety filters + duplicate similarity + metering taslağı
- Gün 25-30: Stripe + onboarding + beta hazırlığı

Bu takvim, kaynak dokümandaki 7/30 günlük planın ürünleşme hedefiyle hizalanmış halidir.

## Riskler ve Bağımlılıklar

- Bağımlılık: X API erişimi, endpoint izinleri, rate limit davranışı.
- Risk: Publish akışında çift gönderim -> idempotency şart.
- Risk: Token güvenliği -> encryption/KMS yaklaşımı gecikirse risk artar.
- Risk: Uyum/policy ihlali algısı -> “human-in-the-loop” ve otomasyon kısıtları zorunlu.
