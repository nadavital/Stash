import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyWorkspaceActionToLiveActivity,
  createLiveAgentActivityState,
  pushLiveAgentActivityEntry,
} from "../../public/app/services/live-agent-activity.js";

describe("live agent activity", () => {
  it("tracks start and done phases for the same action", () => {
    const initial = createLiveAgentActivityState();
    const started = applyWorkspaceActionToLiveActivity(initial, {
      name: "update_note_markdown",
      phase: "start",
    }, Date.UTC(2026, 1, 20, 12, 0, 0));

    assert.equal(started.active, true);
    assert.equal(started.entries.length, 1);
    assert.equal(started.entries[0].status, "running");

    const done = applyWorkspaceActionToLiveActivity(started, {
      name: "update_note_markdown",
      phase: "done",
    }, Date.UTC(2026, 1, 20, 12, 0, 1));

    assert.equal(done.active, false);
    assert.equal(done.entries.length, 1);
    assert.equal(done.entries[0].status, "success");
    assert.equal(done.entries[0].text, "Updating content done");
  });

  it("marks failed actions as error", () => {
    const started = applyWorkspaceActionToLiveActivity(createLiveAgentActivityState(), {
      name: "update_note",
      phase: "start",
    });
    const failed = applyWorkspaceActionToLiveActivity(started, {
      name: "update_note",
      phase: "done",
      error: "network",
    });

    assert.equal(failed.entries[0].status, "error");
    assert.equal(failed.entries[0].text, "Updating item failed");
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
});

