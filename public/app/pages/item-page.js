import { showToast } from "../components/toast/toast.js";
import {
  renderMoveModalHTML,
  queryMoveModalEls,
  openMoveModal,
  closeMoveModal,
  initMoveModalHandlers,
} from "../components/move-modal/move-modal.js";
import {
  renderContentToolbarHTML,
  queryContentToolbarEls,
} from "../components/content-toolbar/content-toolbar.js";
import {
  buildNoteTitle,
  normalizeCitation,
  conciseTechnicalError,
} from "../services/mappers.js";
import { renderItemDetail } from "../services/render-item-detail.js";

function renderItemPageContent() {
  return `
    <section class="page page-item">
      ${renderContentToolbarHTML()}

      <div class="item-detail" id="item-detail">
        <div class="item-detail-loading" id="item-detail-loading">
          <div class="skeleton-card skeleton-pulse" style="height:200px;"></div>
          <div class="skeleton-card skeleton-pulse" style="height:80px;margin-top:12px;"></div>
        </div>
      </div>

      ${renderMoveModalHTML()}
    </section>
  `;
}

function queryPageElements(mountNode) {
  const moveModalEls = queryMoveModalEls(mountNode);
  const toolbarEls = queryContentToolbarEls(mountNode);

  return {
    ...moveModalEls,
    ...toolbarEls,
    itemDetail: mountNode.querySelector("#item-detail"),
    itemDetailLoading: mountNode.querySelector("#item-detail-loading"),
    toast: document.getElementById("toast"),
  };
}

export function createItemPage({ store, apiClient, auth = null, shell }) {
  return {
    async mount({ mountNode, route, navigate }) {
      const itemId = route.itemId || "";
      if (!itemId) {
        navigate("#/");
        return;
      }

      mountNode.innerHTML = renderItemPageContent();
      const pageEls = queryPageElements(mountNode);
      const els = { ...shell.els, ...pageEls };

      const disposers = [];
      let isMounted = true;
      let note = null;
      let relatedNotes = [];
      let moveModalResolver = null;

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

      shell.setToast(toast);
      shell.setOnOpenCitation((n) => {
        if (!n) return;
        navigate(`#/item/${encodeURIComponent(n.id)}`);
      });

      // Toolbar handlers
      on(els.toolbarNewBtn, "click", (e) => {
        e.stopPropagation();
        els.toolbarNewMenu?.classList.toggle("hidden");
      });

      on(els.toolbarSearchToggle, "click", () => {
        navigate("#/");
      });

      on(els.toolbarSignOutBtn, "click", () => {
        auth?.onSignOut?.();
      });

      on(els.toolbarChatToggle, "click", () => {
        shell.toggleChat();
      });

      function resolveMoveDialog(value) {
        if (!moveModalResolver) return;
        const resolver = moveModalResolver;
        moveModalResolver = null;
        resolver(value);
      }

      function openMoveDialog({ title = "Move to folder", confirmLabel = "Move", initialValue = "" } = {}) {
        if (moveModalResolver) resolveMoveDialog(null);
        openMoveModal(els, { title, confirmLabel, value: initialValue, suggestions: [] });
        return new Promise((resolve) => { moveModalResolver = resolve; });
      }

      const cleanupMoveModal = initMoveModalHandlers(els, {
        onClose() { closeMoveModal(els); resolveMoveDialog(null); },
        onSubmit(value) {
          const target = String(value || "").trim();
          if (!target) { els.moveModalInput?.focus(); return; }
          closeMoveModal(els);
          resolveMoveDialog(target);
        },
        onInput() {},
        onSuggestionPick() {},
      });
      disposers.push(cleanupMoveModal);

      function renderNote() {
        if (!note || !els.itemDetail) return;
        renderItemDetail(els.itemDetail, note, {
          relatedNotes,
          onBack() {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              navigate("#/");
            }
          },
          onNavigate(id) {
            navigate(`#/item/${encodeURIComponent(id)}`);
          },
          async onMove() {
            const target = await openMoveDialog({ initialValue: note.project || "" });
            if (!target) return;
            try {
              await apiClient.batchMoveNotes([note.id], target);
              if (!isMounted) return;
              note.project = target;
              toast("Moved");
              renderNote();
            } catch {
              toast("Move failed", "error");
            }
          },
          async onDelete() {
            if (!window.confirm("Delete this item? This action cannot be undone.")) return;
            try {
              await apiClient.deleteNote(note.id);
              if (!isMounted) return;
              toast("Item deleted");
              navigate("#/");
            } catch (err) {
              toast(conciseTechnicalError(err, "Delete failed"), "error");
            }
          },
          async onAddComment(text) {
            try {
              const result = await apiClient.addNoteComment(note.id, { text });
              if (!isMounted) return;
              if (result?.note) {
                note = result.note?.note || result.note;
              }
              toast("Comment added");
              renderNote();
            } catch (err) {
              toast(conciseTechnicalError(err, "Comment failed"), "error");
            }
          },
        });
      }

      // Try to find note in store as immediate fallback
      function findNoteInStore() {
        const storeNotes = store.getState().notes || [];
        for (const entry of storeNotes) {
          const n = normalizeCitation(entry, 0).note;
          if (String(n.id || "") === itemId) return n;
        }
        return null;
      }

      // Fetch note + related in parallel
      try {
        const [noteResult, relatedResult] = await Promise.allSettled([
          apiClient.fetchNote(itemId),
          apiClient.fetchRelatedNotes(itemId, 5),
        ]);

        if (!isMounted) return;

        if (noteResult.status === "fulfilled" && noteResult.value?.note) {
          note = noteResult.value.note;
        } else {
          // Fallback: try store (note was loaded on previous page)
          note = findNoteInStore();
          if (!note) {
            toast("Item not found", "error");
            navigate("#/");
            return;
          }
        }

        if (relatedResult.status === "fulfilled" && Array.isArray(relatedResult.value?.items)) {
          relatedNotes = relatedResult.value.items;
        }

        // Set shell context
        shell.setItemContext(note.id, buildNoteTitle(note));

        renderNote();
      } catch (err) {
        if (!isMounted) return;
        // Last-resort fallback from store
        note = findNoteInStore();
        if (note) {
          shell.setItemContext(note.id, buildNoteTitle(note));
          renderNote();
        } else {
          toast(conciseTechnicalError(err, "Failed to load item"), "error");
          navigate("#/");
        }
        return;
      }

      // Subscribe to SSE for live enrichment updates on this note
      const unsubscribeSSE = apiClient.subscribeToEvents?.((event) => {
        if (!isMounted || !note) return;
        if (event.type === "job:start" && event.id === note.id) {
          note.status = "enriching";
          renderNote();
        }
        if (event.type === "job:complete" && event.result?.id === note.id) {
          note = { ...note, ...event.result, status: "ready" };
          shell.setItemContext(note.id, buildNoteTitle(note));
          renderNote();
        }
        if (event.type === "job:error" && event.id === note.id) {
          note.status = "failed";
          renderNote();
        }
      });

      return () => {
        isMounted = false;
        if (unsubscribeSSE) unsubscribeSSE();
        closeMoveModal(els);
        resolveMoveDialog(null);
        shell.setToast(null);
        shell.setOnOpenCitation(null);
        disposers.forEach((fn) => fn());
      };
    },
  };
}
