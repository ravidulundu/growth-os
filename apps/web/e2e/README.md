# Web E2E Tests

Playwright tabanli E2E suite.

Komutlar:

- `pnpm --filter @growth-os/web test:e2e`
- `pnpm --filter @growth-os/web test:e2e:headed`
- `pnpm --filter @growth-os/web test:e2e:debug`

Kapsanan kritik akislar:

- Unauthorized kullanicinin `/login` sayfasina yonlendirilmesi
- Magic-link request akisi
- Magic-link verify ile dashboard acilisi
- Gecersiz token hata akisi
