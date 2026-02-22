import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { AuthService, buildSessionToken } from "../../src/modules/auth/auth.service";

test("buildSessionToken returns raw token and deterministic hash", () => {
  const { token, tokenHash } = buildSessionToken();

  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(tokenHash, createHash("sha256").update(token).digest("hex"));
});

test("verifyMagicLink persists session hash in auth_sessions", async () => {
  const executedQueries: string[] = [];
  let insertedSessionParams: unknown[] | undefined;

  const fakeClient = {
    async query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      const normalized = sql.replace(/\s+/g, " ").trim();
      executedQueries.push(normalized);

      if (normalized.startsWith("SELECT id, email FROM magic_link_tokens")) {
        return { rows: [{ id: "ml_1", email: "founder@example.com" }] as T[] };
      }

      if (normalized.startsWith("INSERT INTO users")) {
        return { rows: [{ id: "user_1" }] as T[] };
      }

      if (normalized.startsWith("INSERT INTO auth_sessions")) {
        insertedSessionParams = values;
      }

      return { rows: [] as T[] };
    },
    release() {}
  };

  const fakePool = {
    async connect() {
      return fakeClient;
    }
  };

  class TestAuthService extends AuthService {
    protected override dbPool() {
      return fakePool as ReturnType<AuthService["dbPool"]>;
    }
  }

  const service = new TestAuthService();
  const result = await service.verifyMagicLink("raw-magic-link-token");

  assert.equal(result.ok, true);
  assert.equal(result.userId, "user_1");
  assert.match(result.sessionToken, /^[a-f0-9]{64}$/);
  assert.ok(executedQueries.some((query) => query.startsWith("INSERT INTO auth_sessions")));
  assert.ok(insertedSessionParams);
  assert.equal(insertedSessionParams?.[0], "user_1");

  const storedHash = insertedSessionParams?.[1];
  assert.equal(typeof storedHash, "string");
  assert.equal(storedHash, createHash("sha256").update(result.sessionToken).digest("hex"));
  assert.notEqual(storedHash, result.sessionToken);
});
