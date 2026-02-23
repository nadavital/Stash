import { buildAgentNoteTitle, normalizeSingleSentence } from "../chatHelpers.js";

export function createQueryToolHandlers({ searchMemories }) {
  return {
    async ask_user_question(args) {
      const question = normalizeSingleSentence(args.question, 140);
      const options = Array.isArray(args.options)
        ? args.options.map((opt) => normalizeSingleSentence(opt, 60)).filter(Boolean).slice(0, 4)
        : [];
      const contextLine = normalizeSingleSentence(args.context, 120);
      if (!question) {
        throw new Error("ask_user_question requires question");
      }
      return {
        question,
        options,
        allowFreeform: args.allowFreeform !== false,
        context: contextLine,
      };
    },

    async search_notes(args, actor) {
      const results = await searchMemories({
        query: args.query,
        project: args.project || "",
        limit: 6,
        actor,
        scope: String(args.scope || "all"),
        workingSetIds: args.workingSetIds,
      });
      return {
        results: results.slice(0, 6).map((r) => ({
          id: r.note?.id,
          title: buildAgentNoteTitle(r.note, String(r.note?.content || "").slice(0, 80) || "Untitled item"),
          project: r.note?.project || "",
        })),
      };
    },
  };
}
