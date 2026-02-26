import { expect, test } from "@playwright/test";
import { createMockWorkspaceState, installMockApi } from "./support/mockApi.js";

async function openApp(page) {
  await page.goto("/#/");
  await expect(page.locator("#chat-panel-input")).toBeVisible();
  await expect(page.locator("#home-folders-list")).toBeVisible();
}

async function sendChatMessage(page, text) {
  const input = page.locator("#chat-panel-input");
  await input.fill(text);
  await input.press("Enter");
}

test("folder -> item -> back keeps folder items visible", async ({ page }) => {
  const state = createMockWorkspaceState();
  await installMockApi(page, { state });
  await openApp(page);

  await page.locator(".folder-pill", { hasText: "Focus" }).first().click();
  await expect(page).toHaveURL(/#\/folder\/Focus$/);
  await expect(page.locator("#folder-items-grid .folder-file-title", { hasText: "Deep Work Checklist" })).toBeVisible();

  await page.locator("#folder-items-grid .folder-file-tile-shell", { hasText: "Deep Work Checklist" }).first().click();
  await expect(page).toHaveURL(/#\/item\/n1$/);
  await expect(page.locator(".item-title")).toContainText("Deep Work Checklist");

  await page.locator("#item-breadcrumb a.folder-back-link").nth(1).click();
  await expect(page).toHaveURL(/#\/folder\/Focus$/);
  await expect(page.locator("#folder-items-grid .folder-file-title", { hasText: "Deep Work Checklist" })).toBeVisible();
  await expect(page.locator("#folder-items-grid .ui-empty", { hasText: "No items." })).toHaveCount(0);
});

test("chat stays seamless across navigation (no context divider rows)", async ({ page }) => {
  const state = createMockWorkspaceState();
  await installMockApi(page, { state });
  await openApp(page);

  await sendChatMessage(page, "quick check");
  await expect(page.locator(".chat-msg--assistant").first()).toBeVisible();

  await page.locator(".folder-pill", { hasText: "Focus" }).first().click();
  await expect(page).toHaveURL(/#\/folder\/Focus$/);
  await page.locator("#folder-items-grid .folder-file-tile-shell", { hasText: "Deep Work Checklist" }).first().click();
  await expect(page).toHaveURL(/#\/item\/n1$/);
  await page.locator("#item-breadcrumb a.folder-back-link").nth(0).click();
  await expect(page).toHaveURL(/#\/$/);

  await expect(page.locator(".chat-context-divider")).toHaveCount(0);
});

test("follow-up question card compacts after user answers", async ({ page }) => {
  const state = createMockWorkspaceState();
  await installMockApi(page, {
    state,
    onChatRequest: async ({ callIndex }) => {
      if (callIndex === 0) {
        return {
          events: [
            { type: "citations", data: { citations: [] } },
            {
              type: "tool_call",
              data: { name: "ask_user_question", status: "executing" },
            },
            {
              type: "tool_result",
              data: {
                name: "ask_user_question",
                result: {
                  question: "Which folder should I move note N1 into?",
                  options: ["Downtown", "Near transit", "Something else (type it)"],
                  answerMode: "choices_plus_freeform",
                },
              },
            },
            {
              type: "token",
              data: { token: "Which folder should I move note N1 into?" },
            },
            { type: "done", data: { done: true } },
          ],
        };
      }
      return {
        events: [
          { type: "citations", data: { citations: [] } },
          { type: "token", data: { token: "Great, I will tailor options to that area." } },
          { type: "done", data: { done: true } },
        ],
      };
    },
  });

  await openApp(page);
  await sendChatMessage(page, "Help me pick a coffee shop");
  await expect(page.locator(".chat-user-question")).toBeVisible();
  await expect(page.locator(".chat-user-question .chat-question-text")).toContainText(
    "Which folder should I move note into?"
  );
  await expect(page.locator(".chat-question-option", { hasText: "Something else" })).toHaveCount(0);
  await expect(page.locator(".chat-msg--assistant .chat-msg-body").first()).toHaveText("");

  await sendChatMessage(page, "Downtown Palo Alto");
  const prompt = page.locator(".chat-msg--assistant .chat-user-question").first();
  await expect(prompt).toHaveClass(/is-answered/);
  await expect(prompt).toContainText("Answered");
  await expect(prompt).not.toContainText("Downtown Palo Alto");
});

test("task proposal create button saves deterministically without posting chat text", async ({ page }) => {
  const state = createMockWorkspaceState();
  const mock = await installMockApi(page, {
    state,
    onChatRequest: async ({ callIndex }) => {
      if (callIndex === 0) {
        return {
          events: [
            { type: "citations", data: { citations: [] } },
            {
              type: "tool_result",
              data: {
                name: "propose_task",
                result: {
                  title: "The Verge Daily — 9:00 AM",
                  summary: "Save one note per new article in The Verge Daily.",
                  prompt: "Every day at 9:00 AM local time, save one note per new article.",
                  scopeFolder: "The Verge Daily",
                  scheduleType: "interval",
                  intervalMinutes: 1440,
                  timezone: "America/Los_Angeles",
                  maxActionsPerRun: 25,
                  maxConsecutiveFailures: 5,
                  actions: ["Create it", "Cancel"],
                },
              },
            },
            { type: "done", data: { done: true } },
          ],
        };
      }
      return {
        events: [
          { type: "citations", data: { citations: [] } },
          { type: "token", data: { token: "Unexpected second chat call." } },
          { type: "done", data: { done: true } },
        ],
      };
    },
  });

  await openApp(page);
  await sendChatMessage(page, "Create a daily The Verge automation");

  const proposalCard = page.locator(".chat-task-proposal").first();
  await expect(proposalCard).toBeVisible();
  await proposalCard.locator(".chat-task-proposal-action", { hasText: "Create it" }).click();

  await expect(proposalCard.locator(".chat-task-proposal-label")).toContainText("Automation saved");
  await expect(proposalCard.locator(".chat-task-proposal-status")).toContainText("Saved");
  await expect(proposalCard.locator(".chat-task-proposal-actions")).toHaveCount(0);
  await expect(page.locator(".chat-msg--user .chat-msg-body", { hasText: "Create it" })).toHaveCount(0);

  await expect.poll(() => mock.chatRequests.length).toBe(1);
  await expect.poll(() => mock.taskRequests.length).toBe(1);
});

test("follow-up answer options still send chat messages", async ({ page }) => {
  const state = createMockWorkspaceState();
  const mock = await installMockApi(page, {
    state,
    onChatRequest: async ({ callIndex, body }) => {
      if (callIndex === 0) {
        return {
          events: [
            { type: "citations", data: { citations: [] } },
            {
              type: "tool_result",
              data: {
                name: "ask_user_question",
                result: {
                  question: "Which format should I use?",
                  options: ["Bullet list", "Table format"],
                  answerMode: "choices_only",
                },
              },
            },
            { type: "done", data: { done: true } },
          ],
        };
      }
      if (callIndex === 1) {
        if (String(body?.question || "").trim() !== "Bullet list") {
          return {
            status: 400,
            payload: { error: "Expected selected option in question payload" },
          };
        }
        return {
          events: [
            { type: "citations", data: { citations: [] } },
            { type: "token", data: { token: "Using a bullet list format." } },
            { type: "done", data: { done: true } },
          ],
        };
      }
      return {
        events: [
          { type: "citations", data: { citations: [] } },
          { type: "done", data: { done: true } },
        ],
      };
    },
  });

  await openApp(page);
  await sendChatMessage(page, "Help me choose a format");
  await expect(page.locator(".chat-user-question .chat-question-option", { hasText: "Bullet list" })).toBeVisible();
  await page.locator(".chat-user-question .chat-question-option", { hasText: "Bullet list" }).click();

  await expect.poll(() => mock.chatRequests.length).toBe(2);
  await expect(page.locator(".chat-msg--assistant .chat-msg-body").last()).toContainText("Using a bullet list format.");
});

test("unanswered follow-up card persists after refresh", async ({ page }) => {
  const state = createMockWorkspaceState();
  await installMockApi(page, {
    state,
    onChatRequest: async ({ callIndex }) => {
      if (callIndex === 0) {
        return {
          events: [
            { type: "citations", data: { citations: [] } },
            {
              type: "tool_result",
              data: {
                name: "ask_user_question",
                result: {
                  question: "What outcome should I optimize for tomorrow?",
                  options: ["Understand Trai", "Run Cauldron locally"],
                  answerMode: "choices_plus_freeform",
                },
              },
            },
            { type: "done", data: { done: true } },
          ],
        };
      }
      return {
        events: [
          { type: "citations", data: { citations: [] } },
          { type: "token", data: { token: "follow-up handled" } },
          { type: "done", data: { done: true } },
        ],
      };
    },
  });

  await openApp(page);
  await sendChatMessage(page, "help me plan tomorrow");
  await expect(page.locator(".chat-user-question .chat-question-text")).toContainText(
    "What outcome should I optimize for tomorrow?"
  );

  await page.reload();
  await expect(page.locator("#chat-panel-input")).toBeVisible();
  const rehydratedPrompt = page.locator(".chat-user-question").first();
  await expect(rehydratedPrompt).toBeVisible();
  const questionText = rehydratedPrompt.locator(".chat-question-text");
  if (await questionText.count()) {
    await expect(questionText).toContainText("What outcome should I optimize for tomorrow?");
  } else {
    await expect(page.locator(".chat-msg--assistant .chat-msg-body").last()).toContainText(
      "What outcome should I optimize for tomorrow?"
    );
  }
});

test("source chips are compact by default and expandable", async ({ page }) => {
  const state = createMockWorkspaceState();
  await installMockApi(page, {
    state,
    onChatRequest: async () => ({
      events: [
        {
          type: "citations",
          data: {
            citations: [
              {
                rank: 1,
                label: "N1",
                score: 0.9,
                note: state.notes[0],
              },
            ],
          },
        },
        {
          type: "web_sources",
          data: {
            webSources: [
              { title: "Workmode SF Cafes", url: "https://workmode.co/sf/cafes" },
            ],
          },
        },
        {
          type: "token",
          data: { token: "You can start with [N1] and compare with workmode.co listings." },
        },
        { type: "done", data: { done: true } },
      ],
    }),
  });

  await openApp(page);
  await sendChatMessage(page, "Find laptop-friendly cafes");
  await expect(page.locator(".chat-inline-sources .chat-inline-source-chip")).toHaveCount(2);

  const savedToggle = page.locator("#chat-panel-citations .chat-source-toggle");
  const webToggle = page.locator("#chat-panel-web-sources .chat-source-toggle");
  await expect(savedToggle).toContainText("Saved sources");
  await expect(webToggle).toContainText("Web sources");
  await expect(page.locator("#chat-panel-citations .chat-source-list")).toHaveCount(0);
  await expect(page.locator("#chat-panel-web-sources .chat-source-list")).toHaveCount(0);

  await savedToggle.click();
  await webToggle.click();
  await expect(page.locator("#chat-panel-citations .chat-source-list .chat-source-item")).toHaveCount(1);
  await expect(page.locator("#chat-panel-web-sources .chat-source-list .chat-source-link")).toHaveCount(1);
});

test("chat input/send are disabled while a response is in flight", async ({ page }) => {
  const state = createMockWorkspaceState();
  const mock = await installMockApi(page, {
    state,
    onChatRequest: async () => ({
      delayMs: 900,
      events: [
        { type: "citations", data: { citations: [] } },
        { type: "token", data: { token: "Processing complete." } },
        { type: "done", data: { done: true } },
      ],
    }),
  });

  await openApp(page);
  await sendChatMessage(page, "Run a long task");

  await expect(page.locator("#chat-panel-input")).toBeDisabled();
  await expect(page.locator("#chat-panel-send")).toBeDisabled();
  await expect(page.locator("#chat-panel-pending")).toBeHidden();

  // Attempt to send again while pending; should not create another request.
  await page.keyboard.press("Enter");
  await expect.poll(() => mock.chatRequests.length).toBe(1);

  await expect(page.locator(".chat-msg--assistant")).toContainText("Processing complete.");
  await expect(page.locator("#chat-panel-input")).toBeEnabled();
  await expect(page.locator("#chat-panel-send")).toBeEnabled();
});

test("second turn sends explicit recent chat history", async ({ page }) => {
  const state = createMockWorkspaceState();
  const mock = await installMockApi(page, {
    state,
    onChatRequest: async ({ callIndex }) => {
      if (callIndex === 0) {
        return {
          events: [
            { type: "citations", data: { citations: [] } },
            { type: "token", data: { token: "What city are you in?" } },
            { type: "done", data: { done: true } },
          ],
        };
      }
      return {
        events: [
          { type: "citations", data: { citations: [] } },
          { type: "token", data: { token: "Great, using prior context now." } },
          { type: "done", data: { done: true } },
        ],
      };
    },
  });

  await openApp(page);
  await sendChatMessage(page, "Help me find a coffee shop");
  await expect(page.locator(".chat-msg--assistant").first()).toContainText("What city are you in?");

  await sendChatMessage(page, "San Francisco");
  await expect(page.locator(".chat-msg--assistant").nth(1)).toContainText("using prior context");
  await expect.poll(() => mock.chatRequests.length).toBe(2);

  const secondRequest = mock.chatRequests[1] || {};
  const history = Array.isArray(secondRequest.recentMessages) ? secondRequest.recentMessages : [];
  expect(history.length).toBeGreaterThanOrEqual(2);
  expect(history[0]?.role).toBe("user");
  expect(String(history[0]?.text || "")).toContain("Help me find a coffee shop");
  expect(history[1]?.role).toBe("assistant");
  expect(String(history[1]?.text || "")).toContain("What city are you in?");
});

test("chat auth expiry signs user out to the sign-in gate", async ({ page }) => {
  const state = createMockWorkspaceState();
  await installMockApi(page, {
    state,
    onChatRequest: async () => ({
      status: 401,
      payload: { error: "Not authenticated" },
    }),
  });

  await openApp(page);
  await sendChatMessage(page, "help me plan tomorrow");

  await expect(page.locator("#auth-gate-form")).toBeVisible();
  await expect(page.locator("#auth-gate-title")).toContainText("Sign in to Stash");
  await expect(page.locator("#chat-panel-input")).toHaveCount(0);
});
