import { buildAgentNoteTitle, normalizeSingleSentence } from "../chatHelpers.js";

export function createQueryToolHandlers({ searchMemories }) {
  return {
    async ask_user_question(args) {
      const question = normalizeSingleSentence(args.question, 140);
      const options = Array.isArray(args.options)
        ? args.options.map((opt) => normalizeSingleSentence(opt, 60)).filter(Boolean).slice(0, 4)
        : [];
      const contextLine = normalizeSingleSentence(args.context, 120);
      const answerMode = String(args.answerMode || "").trim().toLowerCase();
      const validModes = new Set(["freeform_only", "choices_only", "choices_plus_freeform"]);
      if (!question) {
        throw new Error("ask_user_question requires question");
      }
      if (!validModes.has(answerMode)) {
        throw new Error("ask_user_question requires answerMode");
      }
      const resolvedOptions = answerMode === "choices_plus_freeform"
        ? options.filter((option) => !isGenericOtherOption(option))
        : options;
      if (answerMode !== "freeform_only" && resolvedOptions.length === 0) {
        throw new Error("ask_user_question requires options for choice answerMode");
      }
      return {
        question,
        options: answerMode === "freeform_only" ? [] : resolvedOptions,
        answerMode,
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

function isGenericOtherOption(option = "") {
  const value = String(option || "").trim().toLowerCase();
  if (!value) return false;
  return /^(other|something else|anything else|else|another option|not sure|none of these|none)\b/i.test(value);
}
