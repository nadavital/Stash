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
                  question: "What neighborhood should I optimize for?",
                  options: ["Downtown", "Near transit"],
                  allowFreeform: true,
                },
              },
            },
            {
              type: "token",
              data: { token: "What neighborhood should I optimize for?" },
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

  await sendChatMessage(page, "Downtown Palo Alto");
  const prompt = page.locator(".chat-msg--assistant .chat-user-question").first();
  await expect(prompt).toHaveClass(/is-answered/);
  await expect(prompt).toContainText("Follow-up answered");
  await expect(prompt).toContainText("Answer: Downtown Palo Alto");
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
