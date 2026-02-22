import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { closePool, getPool } from "../../../shared/db/pool";
import { SessionAuthGuard } from "../../../shared/auth/session-auth.guard";

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

test("auth.sessionGuard.workspaceIsolation.integration", async (t) => {
  const pool = getPool();
  const guard = new SessionAuthGuard(new Reflector());
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const sessionToken = `session-${suffix}`;

  const userResult = await pool.query<{ id: string }>(
    `
      INSERT INTO users (email, email_hash, display_name)
      VALUES ($1, $2, 'integration-user')
      RETURNING id;
    `,
    [`guard-${suffix}@example.com`, `email-hash-${suffix}`]
  );
  const userId = userResult.rows[0].id;

  const workspaceAResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`guard-a-${suffix}`]
  );
  const workspaceAId = workspaceAResult.rows[0].id;

  const workspaceBResult = await pool.query<{ id: string }>(
    `
      INSERT INTO workspaces (name, plan_key)
      VALUES ($1, 'mvp0')
      RETURNING id;
    `,
    [`guard-b-${suffix}`]
  );
  const workspaceBId = workspaceBResult.rows[0].id;

  const accountResult = await pool.query<{ id: string }>(
    `
      INSERT INTO x_accounts (workspace_id, x_user_id, username, is_active)
      VALUES ($1, $2, $3, true)
      RETURNING id;
    `,
    [workspaceAId, `guard-x-user-${suffix}`, `guard_${suffix}`]
  );
  const accountId = accountResult.rows[0].id;

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
    [workspaceAId, accountId]
  );
  const contentId = contentResult.rows[0].id;

  await pool.query(
    `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, 'owner');
    `,
    [workspaceAId, userId]
  );

  await pool.query(
    `
      INSERT INTO better_auth_sessions (id, user_id, expires_at, token, ip_address, user_agent)
      VALUES ($1, $2, now() + interval '1 day', $3, '127.0.0.1', 'integration-test');
    `,
    [`session-${suffix}`, userId, sessionToken]
  );

  t.after(async () => {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1 OR id = $2", [
      workspaceAId,
      workspaceBId
    ]);
    await closePool();
  });

  const optionalRouteRequest: GuardRequest = {
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    method: "GET",
    routerPath: "/auth/session"
  };

  const optionalAllowed = await guard.canActivate(buildContext(optionalRouteRequest));
  assert.equal(optionalAllowed, true);
  assert.equal(optionalRouteRequest.auth?.userId, userId);
  assert.equal(optionalRouteRequest.auth?.workspaceId, undefined);

  const allowedWorkspaceRequest: GuardRequest = {
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    method: "GET",
    routerPath: "/scheduling/jobs/:workspaceId",
    params: {
      workspaceId: workspaceAId
    }
  };

  const protectedAllowed = await guard.canActivate(buildContext(allowedWorkspaceRequest));
  assert.equal(protectedAllowed, true);
  assert.equal(allowedWorkspaceRequest.auth?.workspaceId, workspaceAId);

  const deniedWorkspaceRequest: GuardRequest = {
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    method: "GET",
    routerPath: "/scheduling/jobs/:workspaceId",
    params: {
      workspaceId: workspaceBId
    }
  };

  await assert.rejects(
    () => guard.canActivate(buildContext(deniedWorkspaceRequest)),
    (error) =>
      error instanceof ForbiddenException && error.message.includes("Workspace access denied")
  );

  const resourceScopedRequest: GuardRequest = {
    headers: {
      authorization: `Bearer ${sessionToken}`
    },
    method: "GET",
    routerPath: "/generation/content/:workspaceId/:contentId/versions",
    params: {
      contentId
    }
  };

  const resourceAllowed = await guard.canActivate(buildContext(resourceScopedRequest));
  assert.equal(resourceAllowed, true);
  assert.equal(resourceScopedRequest.auth?.workspaceId, workspaceAId);
});
