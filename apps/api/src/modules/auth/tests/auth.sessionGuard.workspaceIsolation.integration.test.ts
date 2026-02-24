import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { closePool, getPool } from "../../../shared/db/pool";
import { SessionAuthGuard } from "../../../shared/auth/session-auth.guard";

type DbPool = ReturnType<typeof getPool>;

type GuardRequest = {
  headers: Record<string, string>;
  method: string;
  routerPath: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  auth?: { userId: string; sessionId: string; workspaceId?: string };
};

function buildContext(request: GuardRequest): ExecutionContext {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined
    }),
    getArgByIndex: (index: number) => {
      const args: unknown[] = [request, {}, undefined];
      return args[index];
    },
    getArgs: () => [request, {}, undefined],
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never
  } as unknown as ExecutionContext;
}

type GuardFixture = {
  userId: string;
  workspaceAId: string;
  workspaceBId: string;
  contentId: string;
  accountWorkspaceBId: string;
  sessionToken: string;
};

function buildSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

async function insertUser(pool: DbPool, suffix: string): Promise<string> {
  const userResult = await pool.query<{ id: string }>(
    `
      INSERT INTO users (email, email_hash, display_name)
      VALUES ($1, $2, 'integration-user')
      RETURNING id;
    `,
    [`guard-${suffix}@example.com`, `email-hash-${suffix}`]
  );
  const userRow = userResult.rows[0];
  assert.ok(userRow, "user insert should return id");
  return userRow.id;
}

async function insertWorkspace(pool: DbPool, name: string): Promise<string> {
  const workspaceResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [name]
  );
  const workspaceRow = workspaceResult.rows[0];
  assert.ok(workspaceRow, "workspace insert should return id");
  return workspaceRow.id;
}

async function insertAccount(
  pool: DbPool,
  workspaceId: string,
  xUserId: string,
  username: string
): Promise<string> {
  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceId, xUserId, username]
  );
  const accountRow = accountResult.rows[0];
  assert.ok(accountRow, "account insert should return id");
  return accountRow.id;
}

async function insertContent(
  pool: DbPool,
  workspaceId: string,
  accountId: string
): Promise<string> {
  const contentResult = await pool.query<{ id: string }>(
    `
      INSERT INTO contents (
        workspace_id,
        account_id,
        type,
        status,
        topic,
        prompt_input,
        current_text
      )
      VALUES ($1, $2, 'tweet', 'draft', 'topic', 'prompt', 'text')
      RETURNING id;
    `,
    [workspaceId, accountId]
  );
  const contentRow = contentResult.rows[0];
  assert.ok(contentRow, "content insert should return id");
  return contentRow.id;
}

async function insertWorkspaceOwner(
  pool: DbPool,
  workspaceId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, 'owner');
    `,
    [workspaceId, userId]
  );
}

async function insertSession(
  pool: DbPool,
  userId: string,
  sessionId: string,
  sessionToken: string
): Promise<void> {
  await pool.query(
    `
      INSERT INTO better_auth_sessions (id, user_id, expires_at, token, ip_address, user_agent)
      VALUES ($1, $2, now() + interval '1 day', $3, '127.0.0.1', 'integration-test');
    `,
    [sessionId, userId, sessionToken]
  );
}

async function createFixture(pool: DbPool): Promise<GuardFixture> {
  const suffix = buildSuffix();
  const sessionToken = `session-${suffix}`;
  const userId = await insertUser(pool, suffix);
  const workspaceAId = await insertWorkspace(pool, `guard-a-${suffix}`);
  const workspaceBId = await insertWorkspace(pool, `guard-b-${suffix}`);
  const accountId = await insertAccount(
    pool,
    workspaceAId,
    `guard-x-user-${suffix}`,
    `guard_${suffix}`
  );
  const accountWorkspaceBId = await insertAccount(
    pool,
    workspaceBId,
    `guard-x-user-b-${suffix}`,
    `guard_b_${suffix}`
  );
  const contentId = await insertContent(pool, workspaceAId, accountId);
  await insertWorkspaceOwner(pool, workspaceAId, userId);
  await insertSession(pool, userId, `session-${suffix}`, sessionToken);
  return { userId, workspaceAId, workspaceBId, contentId, accountWorkspaceBId, sessionToken };
}

function buildAuthHeaders(sessionToken: string): Record<string, string> {
  return { authorization: `Bearer ${sessionToken}` };
}

async function assertOptionalRouteAllowed(
  guard: SessionAuthGuard,
  fixture: GuardFixture
): Promise<void> {
  const optionalRouteRequest: GuardRequest = {
    headers: buildAuthHeaders(fixture.sessionToken),
    method: "GET",
    routerPath: "/auth/session"
  };
  const optionalAllowed = await guard.canActivate(buildContext(optionalRouteRequest));
  assert.equal(optionalAllowed, true);
  assert.equal(optionalRouteRequest.auth?.userId, fixture.userId);
  assert.equal(optionalRouteRequest.auth?.workspaceId, undefined);
}

async function assertProtectedWorkspaceAllowed(
  guard: SessionAuthGuard,
  fixture: GuardFixture
): Promise<void> {
  const allowedWorkspaceRequest: GuardRequest = {
    headers: buildAuthHeaders(fixture.sessionToken),
    method: "GET",
    routerPath: "/scheduling/jobs/:workspaceId",
    params: {
      workspaceId: fixture.workspaceAId
    }
  };
  const protectedAllowed = await guard.canActivate(buildContext(allowedWorkspaceRequest));
  assert.equal(protectedAllowed, true);
  assert.equal(allowedWorkspaceRequest.auth?.workspaceId, fixture.workspaceAId);
}

async function assertProtectedWorkspaceDenied(
  guard: SessionAuthGuard,
  fixture: GuardFixture
): Promise<void> {
  const deniedWorkspaceRequest: GuardRequest = {
    headers: buildAuthHeaders(fixture.sessionToken),
    method: "GET",
    routerPath: "/scheduling/jobs/:workspaceId",
    params: {
      workspaceId: fixture.workspaceBId
    }
  };
  await assert.rejects(
    () => guard.canActivate(buildContext(deniedWorkspaceRequest)),
    (error) =>
      error instanceof ForbiddenException && error.message.includes("Workspace access denied")
  );
}

async function assertResourceScopedAllowed(
  guard: SessionAuthGuard,
  fixture: GuardFixture
): Promise<void> {
  const resourceScopedRequest: GuardRequest = {
    headers: buildAuthHeaders(fixture.sessionToken),
    method: "GET",
    routerPath: "/generation/content/:workspaceId/:contentId/versions",
    params: {
      contentId: fixture.contentId
    }
  };
  const resourceAllowed = await guard.canActivate(buildContext(resourceScopedRequest));
  assert.equal(resourceAllowed, true);
  assert.equal(resourceScopedRequest.auth?.workspaceId, fixture.workspaceAId);
}

async function assertConflictingScopeDenied(
  guard: SessionAuthGuard,
  fixture: GuardFixture
): Promise<void> {
  const conflictingScopedRequest: GuardRequest = {
    headers: buildAuthHeaders(fixture.sessionToken),
    method: "POST",
    routerPath: "/scheduling/publish-now",
    body: {
      contentId: fixture.contentId,
      accountId: fixture.accountWorkspaceBId
    }
  };
  await assert.rejects(
    () => guard.canActivate(buildContext(conflictingScopedRequest)),
    (error) =>
      error instanceof ForbiddenException && error.message.includes("Workspace access denied")
  );
}

test("auth.sessionGuard.workspaceIsolation.integration", async (t) => {
  const pool = getPool();
  const guard = new SessionAuthGuard(new Reflector());
  const fixture = await createFixture(pool);

  t.after(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [fixture.userId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1 OR id = $2", [
      fixture.workspaceAId,
      fixture.workspaceBId
    ]);
    await closePool();
  });

  await assertOptionalRouteAllowed(guard, fixture);
  await assertProtectedWorkspaceAllowed(guard, fixture);
  await assertProtectedWorkspaceDenied(guard, fixture);
  await assertResourceScopedAllowed(guard, fixture);
  await assertConflictingScopeDenied(guard, fixture);
});
