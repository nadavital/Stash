import { createToolHandlers } from "./toolHandlers/index.js";

export function createChatToolExecutor(deps) {
  const toolHandlers = createToolHandlers(deps);

  return async function executeChatToolCall(name, args, actor, { chatAttachment = null } = {}) {
    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return handler(args, actor, { chatAttachment });
  };
}
