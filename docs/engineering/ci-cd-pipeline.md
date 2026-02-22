# CI/CD Pipeline (Adım Adım)

Bu doküman Faz 5 kapsamındaki CI/CD akışını tanımlar:

`lint -> typecheck -> unit test -> integration test -> build -> deploy`

## Pipeline Akışı

Workflow: `.github/workflows/ci.yml`

1. `guardrails` (sadece PR)
   - Branch adı kuralı
   - Conventional commit kuralı
2. `lint`
3. `typecheck`
4. `unit_tests`
5. `integration_tests` (Postgres + Redis service, `pnpm db:migrate`)
6. `build`
7. `dependency_audit` (`pnpm audit --prod --audit-level high`, advisory mod)
8. `deploy_staging` (sadece `develop` push, deploy hook varsa)
9. `smoke_staging` (`/health` + `POST /auth/magic-link/request`)
10. `verify_prod_tag` (`v0.x.y` tag commit'i `main` üstünde mi kontrolü)
11. `deploy_prod` (sadece `v*` tag, production environment)
12. `smoke_prod`

## Branch/Release Kuralları

- `develop`: staging deploy
- `main`: production-ready branch
- Production deploy tetikleyici: `v0.x.y` formatında tag

## Güvenlik Kontrolleri

Workflow: `.github/workflows/security.yml`

- CodeQL: push/PR + haftalık schedule
- Snyk: opsiyonel, `SNYK_TOKEN` tanımlıysa çalışır
- Dependency audit: CI içinde otomatik çalışır
- Secret scanning: GitHub Secret Scanning özelliği repo seviyesinde aktif edilmelidir

## Deploy Stratejisi

- MVP: rolling deploy
- Sonraki faz: API + worker için blue/green, ardından canary

## Rollback

1. Uygulama rollback
   - Önceki image/tag'e dön
2. DB rollback
   - Uygunsa down migration
   - Değilse forward-fix migration

## Manual Approval

- `production` environment için GitHub Environment protection altında required reviewers tanımlanır.
- Bu ayar aktifse `deploy_prod` otomatik beklemeye geçer.

## Gerekli Secrets

Staging:

- `STAGING_DEPLOY_HOOK_URL`
- `STAGING_SMOKE_BASE_URL`

Production:

- `PRODUCTION_DEPLOY_HOOK_URL`
- `PRODUCTION_SMOKE_BASE_URL`

Security:

- `SNYK_TOKEN` (opsiyonel)

## Yardımcı Scriptler

- `pnpm deploy:staging`
- `pnpm deploy:prod`
- `pnpm smoke:test`
