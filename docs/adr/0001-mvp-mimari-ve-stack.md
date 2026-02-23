# ADR-0001: MVP Mimari ve Stack Seçimi

- Status: Accepted
- Date: 2026-02-22
- Owners: Product + Engineering

## Bağlam

Ürün hem hızlı MVP teslimi hem de ürünleşmeye hazırlık gerektiriyor. Faz 2 hedefleri:

- AI orkestrasyonu, X API, scheduler ve analytics sınırlarını net ayırmak
- Rate-limit ve pay-per-usage risklerini erken kontrol altına almak
- Erken microservice parçalanmasından kaçınmak

## Karar

`Modüler monolith + clean architecture + ayrı worker process` yaklaşımı seçildi.

- API App: auth, workspace, generator, library, analytics read API
- Worker App: scheduler, publish pipeline, metrics polling
- Shared DB: PostgreSQL
- Shared Queue/Lock: Redis
- Eventing: başlangıçta DB outbox + queue (harici event bus yok)

### Stack

- Frontend: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Backend:
  - Primary: Node.js + NestJS (Fastify adapter), TypeScript
  - Alternative: Python + FastAPI
- DB: PostgreSQL
- Queue/Scheduler: BullMQ (Redis)
- Cache/Rate-limit state: Redis
- Observability: OpenTelemetry + Sentry + structured logs

## Sınırlar (Bounded Context)

- `Auth`: uygulama auth, session, callback handling
- `AI Orchestrator`: prompt template, model routing, output guardrails
- `X Integration`: OAuth, publish, metrics fetch, policy-safe wrappers
- `Style`: style profile extraction ve versiyonlama
- `Generation`: prompt library ve generation policy
- `Content Library`: draft/version lifecycle
- `Scheduler`: due job alma, idempotent dispatch, retry/backoff
- `Analytics`: first-hour snapshot pipeline (T+15/T+60/T+180)
- `Billing` (MVP-1): usage/credits ve plan sayaçları
- `Audit` (MVP-1): güvenlik ve operasyon izleri
- `Usage/Billing-Ready`: endpoint tüketim ölçümü, bütçe alarmları

## Alternatifler

1. Erken microservice

- Artı: net servis ayrımı
- Eksi: operasyonel yük, deploy karmaşıklığı, MVP hız kaybı

2. Tam serverless event mimarisi

- Artı: burst anında ölçek
- Eksi: local geliştirme zorluğu, queue görünürlüğü ve maliyet sürprizi

## Sonuçlar ve Trade-off

- Artı: MVP hızını korur, ürünleşme için modüler sınır bırakır
- Artı: scheduler/publish kritik yolunu worker ile API’den izole eder
- Eksi: tek repo ve ortak DB nedeniyle ileride servis ayrımı migration gerektirir

## Güvenlik ve Uyum Kararı

- OAuth token verisi şifreli saklanır (KMS/secret-backed key)
- Least-privilege scopes uygulanır
- X OAuth2 Authorization Code Flow with PKCE kullanılır
- Refresh akışında `offline.access` scope planlanır
- Auto-action kapsamı policy-safe whitelist ile sınırlanır
- Audit log zorunlu: auth/publish/role değişimi

## Ne Zaman Yeniden Değerlendirilir?

- Günlük publish job > 100k
- P95 publish latency > 5 sn ve worker yatay ölçekle düzelmiyorsa
- Team/enterprise gereksinimiyle tenant izolasyonu daha sert hale gelirse
