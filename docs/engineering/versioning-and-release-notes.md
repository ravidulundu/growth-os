# Versioning and Release Notes

## Versioning

Use SemVer with rapid-iteration phase:

- `0.y.z`

Meaning:

- `0.y.0`: feature iteration releases
- `0.y.z`: patch/hotfix within iteration

## Release Flow

- Branches:
  - `main` (prod)
  - `develop` (staging)
- Release branch:
  - `release/<version>`
- Release tag:
  - `v<version>`

## Release Notes Standard

Sections required:

1. Summary
2. Features
3. Fixes
4. Breaking Changes
5. Migrations / Ops Notes
6. Rollback Plan

## Automated Changelog

- Source: Conventional Commits
- Tooling: Release Please workflow (`.github/workflows/release-please.yml`)
- Output:
  - automated changelog updates
  - release PR proposal
