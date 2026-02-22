# Test Stratejisi ve Quality Gates

## Amaç ve Kapsam

- Kritik akışlarda regresyonu önlemek: `OAuth -> publish -> metrics`
- Uyum/safety kontrollerini test edilebilir hale getirmek

## Test Piramidi

- Unit: hızlı, deterministik, domain davranışı
- Integration: modüller + DB + dış servis adapter sınırı
- E2E: kullanıcı akışı (web -> api -> worker -> analytics)

## Kapsam Matrisi

| Alan               | Unit                                    | Integration                                  | E2E                    |
| ------------------ | --------------------------------------- | -------------------------------------------- | ---------------------- |
| OAuth2 PKCE        | state/verifier helper doğrulama         | callback/state doğrulama + token persistence | connect adımı          |
| Generation         | prompt composer + constraints birleşimi | draft/version persistence                    | generate/edit adımı    |
| Scheduling/Publish | state machine + backoff/rate-limit      | enqueue -> publish job state geçişi          | schedule/publish adımı |
| Analytics          | snapshot mapping/window logic           | metric snapshot persistence                  | analytics görünürlüğü  |
| Safety/Compliance  | similarity threshold + safe-mode guard  | publish öncesi policy/guard davranışı        | staging dry-run akışı  |

## Test Naming Standardı

- Standart: `module.function.behavior.(unit|integration|e2e).test.ts`
- Örnek:
  - `x_integration.completeConnect.stateValidation.integration.test.ts`
  - `scheduling.backoff.exponentialCap.unit.test.ts`

## Test Organizasyonu

- Unit:
  - `apps/api/tests/**`
- Integration:
  - `apps/api/src/modules/<mod>/tests/*.integration.test.ts`
- Contract tests:
  - API response shape snapshot testleri (`*.contract.test.ts`)

## Coverage Hedefleri

- MVP-0: API katmanı minimum `%70` (özellikle `scheduling` ve `x_integration`)
- MVP-1: kritik modüllerde hedef `%80`
- Mevcut gate scripti: `pnpm coverage:api`

## CI Quality Gates

- `lint` zorunlu
- `typecheck` zorunlu
- `unit test` zorunlu
- `integration test` (en az 1 suite) zorunlu
- DB migrate adımı zorunlu (integration öncesi)

## Çalıştırma Komutları

- Unit: `pnpm test:unit`
- Integration: `pnpm test:integration`
- Coverage: `pnpm coverage:api`
- Tam kalite kapısı: `pnpm quality:gate`
