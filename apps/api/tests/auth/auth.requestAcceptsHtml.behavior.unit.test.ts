import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { requestAcceptsHtml } from "../../src/modules/auth/auth.controller";

function mockRequest(headers: FastifyRequest["headers"]): FastifyRequest {
  return { headers } as FastifyRequest;
}

test("auth.requestAcceptsHtml.behavior.unit", () => {
  assert.equal(
    requestAcceptsHtml(
      mockRequest({
        accept: "text/html,application/xhtml+xml",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document"
      })
    ),
    true
  );

  assert.equal(
    requestAcceptsHtml(
      mockRequest({
        accept: "text/html,*/*;q=0.8",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty"
      })
    ),
    false
  );

  assert.equal(
    requestAcceptsHtml(
      mockRequest({
        accept: "application/json"
      })
    ),
    false
  );
});
