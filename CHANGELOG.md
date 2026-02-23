# Changelog

Tüm önemli değişiklikler bu dosyada tutulur.

Format:

- Summary
- Features
- Fixes
- Breaking Changes
- Migrations / Ops Notes
- Rollback Plan

## [0.2.0](https://github.com/ravidulundu/growth-os/compare/v0.1.0...v0.2.0) (2026-02-23)


### Features

* add billing metering and upgrade api security dependencies ([76bac68](https://github.com/ravidulundu/growth-os/commit/76bac6867cc83806d6367695a5ac2aab89e4523b))
* add strict monorepo structure and engineering guardrails ([8a17d0e](https://github.com/ravidulundu/growth-os/commit/8a17d0ea68844ef76a66d871d59cc8a3b68a38df))
* close key MVP gaps across auth, generation, style, and analytics ([62ff852](https://github.com/ravidulundu/growth-os/commit/62ff852d6991ee9dd613a07437b71ef260b65d99))
* migrate auth to Better Auth flow and enforce CI auth contracts ([876c277](https://github.com/ravidulundu/growth-os/commit/876c277d63e7f690792206ae82e05d65534728c0))
* **mvp:** implement phase 5 core flow and fix PR review findings ([0ae6925](https://github.com/ravidulundu/growth-os/commit/0ae69257f664968744501b0f3d5b4948f0f191f4))
* strict proje yapısı ve kurallar ([6f8e54d](https://github.com/ravidulundu/growth-os/commit/6f8e54d8aded1a55f9ec7993bd5414703d30bdb3))


### Bug Fixes

* address remaining PR review threads ([10f8a4a](https://github.com/ravidulundu/growth-os/commit/10f8a4aec8dfe630b4cc2f854bf7a1e988e9796c))
* address remaining worker and x integration review findings ([190897a](https://github.com/ravidulundu/growth-os/commit/190897a8c7c4720a534cf42173c63404f489300c))
* **auth:** avoid bearer token truncation on whitespace ([9280556](https://github.com/ravidulundu/growth-os/commit/92805561cbb71df0aa675c9a4b76b30cd0d73dc4))
* **auth:** harden origin allowlists and auth lifecycle ([17887be](https://github.com/ravidulundu/growth-os/commit/17887be5204045290da2703937b75cd1b4513b30))
* close critical PR review gaps across worker, generation, auth, and web ([dc03614](https://github.com/ravidulundu/growth-os/commit/dc036146e4578845548831d4cbf6b6f551627778))
* close critical PR review gaps across worker, generation, auth, and web ([8f8a4d2](https://github.com/ravidulundu/growth-os/commit/8f8a4d21912e28f6f590976bccbca48de795c549))
* close remaining PR review findings and harden auth/worker/ci ([1fabb2c](https://github.com/ravidulundu/growth-os/commit/1fabb2c0a6e76c1be63d30375dcb85a8f53c735e))
* close remaining PR review findings in generation analytics auth and worker ([de148e5](https://github.com/ravidulundu/growth-os/commit/de148e5afc30c46adf808bf7701d8476e06e58bd))
* close remaining review threads and harden dedupe/auth test fidelity ([fa1ae34](https://github.com/ravidulundu/growth-os/commit/fa1ae34f73349b4648a0d5d384076793d975f8d4))
* **cors:** avoid 500 on disallowed origins ([fa3b372](https://github.com/ravidulundu/growth-os/commit/fa3b372ca4c7719dcaed82d9b0dfb13ad41406ac))
* resolve open PR review findings across auth and scheduling ([5c22420](https://github.com/ravidulundu/growth-os/commit/5c22420f69822f993e6f47edce3add56442c4092))
* resolve open PR review findings for auth, validation, worker and codeql ([b9260bd](https://github.com/ravidulundu/growth-os/commit/b9260bda1b2f9e4b35320919cd5cfbf4cfb0eab7))
* resolve PR review findings and enforce strict lint rules ([1d28ba2](https://github.com/ravidulundu/growth-os/commit/1d28ba26dd15954fe7dd3bdbc8c1a180c4efddd5))
* **review:** harden publish flow and enforce api session auth ([173822c](https://github.com/ravidulundu/growth-os/commit/173822c313e917413d2244695ede3cce05ba9c8d))
* **review:** resolve latest PR feedback and finalize ci-cd pipeline ([d275147](https://github.com/ravidulundu/growth-os/commit/d2751473882cb8a2e649317c7f7554accfccc191))
* **review:** resolve remaining PR security and CI issues ([2dd5a93](https://github.com/ravidulundu/growth-os/commit/2dd5a938ea8eba6d0264c1e930ffdd92d8f2e22a))
* **review:** resolve remaining PR threads and harden scheduling flows ([5db9d2c](https://github.com/ravidulundu/growth-os/commit/5db9d2c7bf7ae5233f1f567e813385c27d65152e))
* **worker:** align similarity guard with safe mode config ([d277d87](https://github.com/ravidulundu/growth-os/commit/d277d87a5d79290f985c0b707c27a3fd3ac50f5c))
* **worker:** harden publish recovery and workspace authorization ([0f694e5](https://github.com/ravidulundu/growth-os/commit/0f694e52a79179539410e4c6af10169dc71b49c6))

## [0.1.0] - 2026-02-22

### Summary

- Initial monorepo skeleton and engineering guardrails.

### Features

- Added web/api/worker setup.
- Added migration and seed workflow.

### Fixes

- N/A

### Breaking Changes

- N/A

### Migrations / Ops Notes

- Local DB/Redis ports: `55432` / `56379`

### Rollback Plan

- Revert to previous tag and run migration rollback if needed.
