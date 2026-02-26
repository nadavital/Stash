import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferUserTimezoneFromMessages,
  inferTaskNextRunAtFromMessages,
  isExplicitTaskCreationConfirmation,
  normalizeIanaTimezone,
} from "../../src/chat/chatHelpers.js";

describe("chatHelpers task confirmation", () => {
  it("accepts explicit create confirmation phrases", () => {
    assert.equal(isExplicitTaskCreationConfirmation("Create it"), true);
    assert.equal(isExplicitTaskCreationConfirmation("Yes, go ahead"), true);
    assert.equal(isExplicitTaskCreationConfirmation("Please save this automation"), true);
  });

  it("rejects exploratory scheduling asks as confirmation", () => {
    assert.equal(isExplicitTaskCreationConfirmation("Can you create a task for this?"), false);
    assert.equal(isExplicitTaskCreationConfirmation("What task should I create?"), false);
    assert.equal(isExplicitTaskCreationConfirmation("No, cancel"), false);
  });
});

describe("chatHelpers timezone inference", () => {
  it("accepts valid IANA timezone strings", () => {
    assert.equal(normalizeIanaTimezone("America/Los_Angeles"), "America/Los_Angeles");
  });

  it("rejects invalid timezone strings", () => {
    assert.equal(normalizeIanaTimezone("local time"), "");
    assert.equal(normalizeIanaTimezone("America/NotARealZone"), "");
  });

  it("prefers explicit IANA timezone in current question", () => {
    const inferred = inferUserTimezoneFromMessages({
      question: "Run it at 9am America/Los_Angeles",
      configuredTimezone: "America/New_York",
    });
    assert.equal(inferred, "America/Los_Angeles");
  });

  it("falls back to configured timezone when messages omit IANA timezone", () => {
    const inferred = inferUserTimezoneFromMessages({
      question: "9:00 AM local time",
      recentMessages: [{ role: "assistant", text: "What time each morning?" }],
      configuredTimezone: "America/Chicago",
    });
    assert.equal(inferred, "America/Chicago");
  });
});

describe("chatHelpers task next run inference", () => {
  it("infers a concrete daily nextRunAt from explicit user time", () => {
    const nextRunAt = inferTaskNextRunAtFromMessages({
      question: "Create it",
      recentMessages: [
        { role: "assistant", text: "What time each morning?" },
        { role: "user", text: "9:00 AM local time" },
      ],
      timezone: "America/Los_Angeles",
      scheduleType: "interval",
      intervalMinutes: 1440,
      now: new Date("2026-02-24T12:00:00.000Z"),
    });
    assert.ok(nextRunAt);
    const display = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(nextRunAt));
    assert.equal(display, "9:00 AM");
  });

  it("uses a morning default anchor when only day period is provided", () => {
    const nextRunAt = inferTaskNextRunAtFromMessages({
      question: "set this up for morning",
      recentMessages: [],
      timezone: "America/New_York",
      scheduleType: "interval",
      intervalMinutes: 1440,
      now: new Date("2026-02-24T12:00:00.000Z"),
    });
    assert.ok(nextRunAt);
    const display = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(nextRunAt));
    assert.equal(display, "9:00 AM");
  });
});
