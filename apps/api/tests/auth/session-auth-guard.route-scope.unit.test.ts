import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkspaceScopeOptionalRoute,
  resolveRouteKey
} from "../../src/shared/auth/session-auth.guard";

test("resolveRouteKey resolves route key from routerPath and url fallback", () => {
  assert.equal(
    resolveRouteKey({
      method: "get",
      routerPath: "/auth/session"
    }),
    "GET:/auth/session"
  );

  assert.equal(
    resolveRouteKey({
      method: "POST",
      url: "/scheduling/publish-now?x=1"
    }),
    "POST:/scheduling/publish-now"
  );
});

test("isWorkspaceScopeOptionalRoute only allows explicit workspace-optional endpoints", () => {
  assert.equal(
    isWorkspaceScopeOptionalRoute({
      method: "GET",
      routerPath: "/auth/session"
    }),
    true
  );

  assert.equal(
    isWorkspaceScopeOptionalRoute({
      method: "GET",
      routerPath: "/scheduling/jobs/123"
    }),
    false
  );
});
