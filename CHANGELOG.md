# Changelog

Tüm önemli değişiklikler bu dosyada tutulur.

Format:

- Summary
- Features
- Fixes
- Breaking Changes
- Migrations / Ops Notes
- Rollback Plan

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
