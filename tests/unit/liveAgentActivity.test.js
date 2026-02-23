import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyWorkspaceActionToLiveActivity,
  createLiveAgentActivityState,
  pushLiveAgentActivityEntry,
} from "../../public/app/services/live-agent-activity.js";

describe("live agent activity", () => {
  it("tracks start/progress/commit phases for the same action", () => {
    const initial = createLiveAgentActivityState();
    const started = applyWorkspaceActionToLiveActivity(initial, {
      name: "update_note_markdown",
      phase: "start",
    }, Date.UTC(2026, 1, 20, 12, 0, 0));

    assert.equal(started.active, true);
    assert.equal(started.entries.length, 1);
    assert.equal(started.entries[0].status, "running");
    assert.equal(started.entries[0].text, "Agent editing...");

    const progressed = applyWorkspaceActionToLiveActivity(started, {
      name: "update_note_markdown",
      phase: "progress",
    }, Date.UTC(2026, 1, 20, 12, 0, 0, 500));
    assert.equal(progressed.active, true);
    assert.equal(progressed.entries[0].status, "running");
    assert.equal(progressed.entries[0].text, "Agent editing...");

    const done = applyWorkspaceActionToLiveActivity(progressed, {
      name: "update_note_markdown",
      phase: "commit",
    }, Date.UTC(2026, 1, 20, 12, 0, 1));

    assert.equal(done.active, false);
    assert.equal(done.entries.length, 1);
    assert.equal(done.entries[0].status, "success");
    assert.equal(done.entries[0].text, "Updated by AI just now");
  });

  it("marks failed actions as error on error phase", () => {
    const started = applyWorkspaceActionToLiveActivity(createLiveAgentActivityState(), {
      name: "update_note",
      phase: "start",
    });
    const failed = applyWorkspaceActionToLiveActivity(started, {
      name: "update_note",
      phase: "error",
      error: "network",
    });

    assert.equal(failed.entries[0].status, "error");
    assert.equal(failed.entries[0].text, "Couldn’t apply AI update");
  });

  it("adds ad-hoc remote entries and limits history", () => {
    let state = createLiveAgentActivityState();
    for (let i = 0; i < 12; i += 1) {
      state = pushLiveAgentActivityEntry(state, {
        text: `Remote update ${i + 1}`,
        status: "queued",
        actionName: "remote_update",
      });
    }
    assert.equal(state.entries.length, 8);
    assert.equal(state.entries[0].text, "Remote update 12");
    assert.equal(state.entries[7].text, "Remote update 5");
  });

  it("resolves start/done by actionId when action names repeat", () => {
    const startTs = Date.UTC(2026, 1, 20, 13, 0, 0);
    const doneTs = Date.UTC(2026, 1, 20, 13, 0, 1);

    let state = createLiveAgentActivityState();
    state = applyWorkspaceActionToLiveActivity(state, {
      name: "update_note",
      actionId: "a-1",
      phase: "start",
    }, startTs);
    state = applyWorkspaceActionToLiveActivity(state, {
      name: "update_note",
      actionId: "a-2",
      phase: "start",
    }, startTs + 1);

    state = applyWorkspaceActionToLiveActivity(state, {
      name: "update_note",
      actionId: "a-1",
      phase: "commit",
    }, doneTs);

    const first = state.entries.find((entry) => entry.actionId === "a-1");
    const second = state.entries.find((entry) => entry.actionId === "a-2");

    assert.equal(first?.status, "success");
    assert.equal(second?.status, "running");
  });
});
