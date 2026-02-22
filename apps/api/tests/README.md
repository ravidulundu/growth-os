# API Tests

Minimum policy:

- New module must include at least 1 unit test.
- X integration changes must include integration tests with mock/stub.

Naming standard:

- `module.function.behavior.unit.test.ts`
- `module.function.behavior.integration.test.ts`
- `module.function.behavior.e2e.test.ts`

Organization:

- Unit tests: `apps/api/tests/**`
- Integration tests: `apps/api/src/modules/<module>/tests/**`
