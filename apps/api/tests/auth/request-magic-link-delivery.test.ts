import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "../../src/modules/auth/auth.service";

type QueryLog = { sql: string; values?: unknown[] };

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

function createFakePool(requestCount: number, queryLog: QueryLog[]) {
  const client = {
    async query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      const normalized = normalizeSql(sql);
      queryLog.push({ sql: normalized, values });

      if (normalized.startsWith("SELECT COUNT(*)::int AS request_count")) {
        return { rows: [{ request_count: requestCount }] as T[] };
      }

      return { rows: [] as T[] };
    },
    release() {}
  };

  return {
    async connect() {
      return client;
    },
    async query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
      queryLog.push({ sql: normalizeSql(sql), values });
      return { rows: [] as T[] };
    }
  };
}

test("requestMagicLink stores token hash and sends magic link", async () => {
  const executedQueries: QueryLog[] = [];
  const deliveries: Array<{ email: string; token: string }> = [];
  const fakePool = createFakePool(0, executedQueries);

  class TestAuthService extends AuthService {
    protected override dbPool() {
      return fakePool as ReturnType<AuthService["dbPool"]>;
    }

    protected override async sendMagicLink(email: string, token: string) {
      deliveries.push({ email, token });
    }
  }

  const service = new TestAuthService();
  const response = await service.requestMagicLink("Founder@Example.com ");

  assert.equal(response.ok, true);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].email, "founder@example.com");
  assert.match(deliveries[0].token, /^[a-f0-9]{48}$/);
  assert.ok(
    executedQueries.some((q) => q.sql.startsWith("SELECT pg_advisory_xact_lock(hashtext($1))"))
  );
  assert.ok(executedQueries.some((q) => q.sql.startsWith("INSERT INTO magic_link_tokens")));
  assert.ok(
    !executedQueries.some((q) =>
      q.sql.startsWith("DELETE FROM magic_link_tokens WHERE expires_at < now() - interval")
    )
  );
  assert.ok(executedQueries.some((q) => q.sql === "COMMIT"));
});

test("requestMagicLink removes token row when delivery fails", async () => {
  const executedQueries: QueryLog[] = [];
  const fakePool = createFakePool(0, executedQueries);

  class TestAuthService extends AuthService {
    protected override dbPool() {
      return fakePool as ReturnType<AuthService["dbPool"]>;
    }

    protected override async sendMagicLink() {
      throw new Error("smtp unavailable");
    }
  }

  const service = new TestAuthService();
  await assert.rejects(() => service.requestMagicLink("founder@example.com"));

  assert.ok(executedQueries.some((q) => q.sql.startsWith("INSERT INTO magic_link_tokens")));
  assert.ok(
    executedQueries.some((q) =>
      q.sql.startsWith("DELETE FROM magic_link_tokens WHERE token_hash = $1")
    )
  );
});

test("requestMagicLink enforces per-email hourly rate limit", async () => {
  const previousLimit = process.env.AUTH_MAGIC_LINK_MAX_REQUESTS_PER_HOUR;
  process.env.AUTH_MAGIC_LINK_MAX_REQUESTS_PER_HOUR = "5";
  let sendAttempted = false;

  const executedQueries: QueryLog[] = [];
  const fakePool = createFakePool(5, executedQueries);

  class TestAuthService extends AuthService {
    protected override dbPool() {
      return fakePool as ReturnType<AuthService["dbPool"]>;
    }

    protected override async sendMagicLink() {
      sendAttempted = true;
    }
  }

  try {
    const service = new TestAuthService();
    const response = await service.requestMagicLink("founder@example.com");
    assert.equal(response.ok, true);

    assert.ok(
      executedQueries.some((q) => q.sql.startsWith("SELECT COUNT(*)::int AS request_count"))
    );
    assert.ok(executedQueries.some((q) => q.sql === "ROLLBACK"));
    assert.ok(!executedQueries.some((q) => q.sql.startsWith("INSERT INTO magic_link_tokens")));
    assert.equal(sendAttempted, false);
  } finally {
    if (previousLimit === undefined) {
      delete process.env.AUTH_MAGIC_LINK_MAX_REQUESTS_PER_HOUR;
    } else {
      process.env.AUTH_MAGIC_LINK_MAX_REQUESTS_PER_HOUR = previousLimit;
    }
  }
});

test("requestMagicLink requires SMTP outside development and test environments", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSmtpHost = process.env.SMTP_HOST;
  process.env.NODE_ENV = "staging";
  delete process.env.SMTP_HOST;

  const executedQueries: QueryLog[] = [];
  const fakePool = createFakePool(0, executedQueries);

  class TestAuthService extends AuthService {
    protected override dbPool() {
      return fakePool as ReturnType<AuthService["dbPool"]>;
    }
  }

  try {
    const service = new TestAuthService();
    await assert.rejects(() => service.requestMagicLink("founder@example.com"), {
      name: "InternalServerErrorException"
    });

    assert.ok(
      executedQueries.some((q) =>
        q.sql.startsWith("DELETE FROM magic_link_tokens WHERE token_hash = $1")
      )
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousSmtpHost === undefined) {
      delete process.env.SMTP_HOST;
    } else {
      process.env.SMTP_HOST = previousSmtpHost;
    }
  }
});

test("requestMagicLink preserves original send error when cleanup delete fails", async () => {
  const executedQueries: QueryLog[] = [];
  const fakePool = createFakePool(0, executedQueries);

  class TestAuthService extends AuthService {
    protected override dbPool() {
      return {
        ...fakePool,
        async query<T>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> {
          const normalized = normalizeSql(sql);
          executedQueries.push({ sql: normalized, values });
          if (normalized.startsWith("DELETE FROM magic_link_tokens WHERE token_hash = $1")) {
            throw new Error("delete failed");
          }
          return { rows: [] as T[] };
        }
      } as ReturnType<AuthService["dbPool"]>;
    }

    protected override async sendMagicLink() {
      throw new Error("smtp unavailable");
    }
  }

  const service = new TestAuthService();
  await assert.rejects(() => service.requestMagicLink("founder@example.com"), {
    message: "smtp unavailable"
  });
  assert.ok(
    executedQueries.some((q) =>
      q.sql.startsWith("DELETE FROM magic_link_tokens WHERE token_hash = $1")
    )
  );
});
