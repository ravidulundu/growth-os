import assert from "node:assert/strict";
import test from "node:test";
import { nextSchedulerState } from "../../src/modules/scheduling/state-machine";

test("scheduling.nextSchedulerState.state_machine.unit", () => {
  assert.equal(nextSchedulerState("queued", "start"), "in_progress");
  assert.equal(nextSchedulerState("in_progress", "retry"), "retry_wait");
  assert.equal(nextSchedulerState("retry_wait", "start"), "in_progress");
  assert.equal(nextSchedulerState("in_progress", "complete"), "completed");
  assert.throws(() => nextSchedulerState("queued", "complete"), {
    message: /Invalid scheduler state transition/
  });
});
