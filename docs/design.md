# Stash Design System

Comprehensive reference for the Stash UI: design tokens, component catalog, shared services, and conventions.

---

## 1. Design Tokens

All tokens are defined in [`public/styles/tokens.css`](../public/styles/tokens.css). Light mode is the default; dark mode overrides are applied via `@media (prefers-color-scheme: dark)`.

### Colors

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `--bg` | `#f7f7f8` | `#111111` | Page background |
| `--surface` | `#ffffff` | `#1a1a1a` | Card / panel background |
| `--surface-strong` | `#f4f4f4` | `#212121` | Emphasized surface |
| `--surface-subtle` | `#ececf1` | `#151515` | De-emphasized surface |
| `--ink` | `#0d0d0d` | `#ececec` | Primary text |
| `--ink-secondary` | `#374151` | `#b8bdc8` | Secondary text |
| `--muted` | `#6b7280` | `#8b92a5` | Muted / tertiary text |
| `--placeholder` | `#b0b8c4` | `#555d70` | Input placeholder text |
| `--accent` | `#10a37f` | `#1fcc8f` | Primary brand accent |
| `--accent-soft` | `#e6f7f1` | `#0f3d2d` | Accent tint for backgrounds |
| `--accent-deep` | `#0d8a6a` | `#2ee6a5` | Accent hover / emphasis |
| `--warn` | `#b54708` | `#e5a336` | Warning tone |
| `--danger` | `#b42318` | `#ef5350` | Destructive actions |
| `--danger-soft` | `#fee4e2` | `#3d1f1f` | Danger background tint |
| `--danger-surface` | `#fff1f2` | `#2d1518` | Danger surface fill |
| `--danger-border` | `#fecaca` | `#5c2626` | Danger border |
| `--border` | `10% black` | `12% white` | Default border |
| `--border-strong` | `15% black` | `20% white` | Emphasized border |
| `--border-subtle` | `5% black` | `6% white` | Subtle border |
| `--overlay` | `rgba(0,0,0,0.44)` | `rgba(0,0,0,0.6)` | Modal overlay |
| `--input-bg` | `#efefef` | `#212121` | Text input background |
| `--hover-bg` | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.07)` | Hover state |
| `--on-accent` | `#ffffff` | `#ffffff` | Text on accent-colored backgrounds |

#### Icon-type tints

| Token | Light | Dark |
|-------|-------|------|
| `--icon-text` | `#d8e6ff` | `#1e3a5f` |
| `--icon-image` | `#ffd9e7` | `#4a1e30` |
| `--icon-link` | `#d8f1e5` | `#1a3a2a` |
| `--icon-file` | `#f1e4ff` | `#2e1e4a` |

#### State colors

| Token | Value | Purpose |
|-------|-------|---------|
| `--state-processed` | `#10b981` | Note fully enriched |
| `--state-pending` | `#d0d5dd` / `#3a4050` | Awaiting enrichment |
| `--state-accessed` | `#10a37f` / `#1fcc8f` | Recently accessed |
| `--state-task` | `#f59e0b` | Task indicator |

#### Folder colors

| Token | Value |
|-------|-------|
| `--folder-green` | `#04b84c` |
| `--folder-blue` | `#0285ff` |
| `--folder-purple` | `#924ff7` |
| `--folder-orange` | `#fb6a22` |
| `--folder-pink` | `#ff66ad` |
| `--folder-red` | `#fa423e` |
| `--folder-yellow` | `#ffc300` |

### Typography

#### Font families

| Token | Value |
|-------|-------|
| `--font-sans` | `"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif` |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace` |

Fonts are loaded via Google Fonts: Inter (400, 500, 600) and IBM Plex Mono (400, 500).

#### Font size scale

| Token | Value | Usage |
|-------|-------|-------|
| `--font-size-2xs` | `0.62rem` | Tiny badges, timestamps, subfolder counts |
| `--font-size-xs` | `0.72rem` | Small labels, metadata, mono tags |
| `--font-size-caption` | `0.78rem` | Captions, form labels, secondary buttons |
| `--font-size-sm` | `0.82rem` | Subtitles, descriptions |
| `--font-size-body-sm` | `0.88rem` | Compact body text, list items, buttons |
| `--font-size-base` | `0.94rem` | Default body text |
| `--font-size-md` | `1rem` | Form inputs, medium emphasis text |
| `--font-size-lg` | `1.12rem` | Section headings, modal titles |
| `--font-size-xl` | `1.4rem` | Page titles |

#### Font weights

| Token | Value | Usage |
|-------|-------|-------|
| `--weight-normal` | `400` | Body text, descriptions |
| `--weight-medium` | `500` | Buttons, labels, secondary emphasis |
| `--weight-semibold` | `600` | Headings, titles, strong emphasis |

#### Line heights

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-none` | `1` | Icons, single-line buttons |
| `--leading-tight` | `1.3` | Titles, card headings |
| `--leading-snug` | `1.4` | Previews, compact text |
| `--leading-normal` | `1.45` | Body text (default) |
| `--leading-relaxed` | `1.55` | Expanded content, modal body |
| `--leading-loose` | `1.65` | Full-content readability |

### Spacing

| Token | Value |
|-------|-------|
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-5` | `20px` |
| `--space-6` | `24px` |
| `--space-7` | `32px` |
| `--space-8` | `40px` |

### Border Radii

| Token | Value |
|-------|-------|
| `--radius-xs` | `8px` |
| `--radius-sm` | `12px` |
| `--radius-md` | `16px` |
| `--radius-lg` | `20px` |
| `--radius-xl` | `24px` |
| `--radius-pill` | `999px` |

### Shadows

| Token | Value |
|-------|-------|
| `--shadow-1` | `0 1px 2px rgba(0,0,0,0.03)` |
| `--shadow-2` | `0 4px 12px rgba(0,0,0,0.04)` |
| `--shadow` | alias for `--shadow-2` |
| `--shadow-focus` | `0 0 0 3px rgba(16,163,127,0.18)` |
| `--shadow-elevated` | `0 16px 48px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04)` |

Dark mode increases shadow intensity (e.g. `--shadow-2` becomes `rgba(0,0,0,0.2)`).

### Z-Index Layers

| Token | Value | Usage |
|-------|-------|-------|
| `--z-sticky` | `24` | Sticky elements (composer shell) |
| `--z-dropdown` | `30` | Sort/filter dropdown |
| `--z-modal` | `40` | Item modal |
| `--z-modal-alt` | `42` | Folder modal (above item modal) |
| `--z-toast` | `50` | Toast notifications (topmost) |

### Interaction Rail Tokens

| Token | Purpose |
|-------|---------|
| `--safe-bottom` | Safe area inset for devices with a home indicator |
| `--composer-offset` | Vertical offset for fixed composer from viewport edge |
| `--composer-height` | Baseline composer control height |
| `--batch-bar-height` | Height budget for batch action rail |
| `--composer-total-offset` | Derived base offset used for other fixed elements |
| `--page-bottom-space` | Bottom page padding to avoid fixed-UI overlap |
| `--chat-bottom-offset` | Default chat panel bottom offset above composer |
| `--toast-bottom-offset` | Default toast offset above composer |

### Touch Target Tokens

| Token | Purpose |
|-------|---------|
| `--tap-target` | Baseline interactive control size on desktop/tablet surfaces |
| `--tap-target-mobile` | Enlarged minimum touch size for mobile controls |

### Transitions

| Token | Value |
|-------|-------|
| `--transition-fast` | `120ms ease` |
| `--transition-base` | `200ms ease` |
| `--transition-slow` | `300ms ease` |

---

## 2. Component Catalog

All component JS files live under `public/app/components/`. All component CSS files live under `public/styles/components/`.

### Overview Table

| Component | JS Path | CSS Path | Class Prefix |
|-----------|---------|----------|-------------|
| Topbar | `components/topbar/topbar.js` | `components/topbar.css` | `.topbar-*` |
| Auth Gate | `components/auth-gate/auth-gate.js` | `components/auth-gate.css` | `.auth-gate-*` |
| Assistant Shell | `components/assistant-shell/assistant-shell.js` | `components/assistant-shell.css` | `.assistant-*` |
| Composer | `components/composer/composer.js` | `components/composer.css` | `.composer-*` |
| Home Folder Grid | `components/home-folder-grid/home-folder-grid.js` | `components/home-folder-grid.css` | `.folder-pill-*` |
| Home Recent List | `components/home-recent-list/home-recent-list.js` | `components/home-recent-list.css` | `.recent-*` |
| Folder Hero Toolbar | `components/folder-hero-toolbar/folder-hero-toolbar.js` | `components/folder-hero-toolbar.css` | `.folder-hero-*` |
| Folder Item Grid | `components/folder-item-grid/folder-item-grid.js` | `components/folder-item-grid.css` | `.folder-file-*` |
| Activity Feed | `components/activity-feed/activity-feed.js` | `components/activity-feed.css` | `.activity-feed-*` |
| Folder Activity Modal | `components/folder-activity-modal/folder-activity-modal.js` | `components/folder-activity-modal.css` | `.folder-activity-modal-*` |
| Item Modal | `components/item-modal/item-modal.js` | `components/item-modal.css` | `.item-modal-*` |
| Folder Modal | `components/folder-modal/folder-modal.js` | `components/folder-modal.css` | `.folder-modal-*` |
| Folder Share Modal | `components/folder-share-modal/folder-share-modal.js` | `components/folder-share-modal.css` | `.folder-share-*` |
| Move Modal | `components/move-modal/move-modal.js` | `components/move-modal.css` | `.move-modal-*` |
| Activity Modal | `components/activity-modal/activity-modal.js` | `components/activity-modal.css` | `.activity-modal-*` |
| Action Menu | `components/action-menu/action-menu.js` | `components/action-menu.css` | `.action-menu-*` |
| Inline Search | `components/inline-search/inline-search.js` | `components/inline-search.css` | `.inline-search-*` |
| Markdown Editor | `components/markdown-editor/markdown-editor.js` | `components/markdown.css` | `.md-editor-*` |
| Chat Panel | `components/chat-panel/chat-panel.js` | `components/chat-panel.css` | `.chat-panel-*` |
| Sort/Filter | `components/sort-filter/sort-filter.js` | (in `topbar.css`) | `.sort-filter-*` |
| Toast | `components/toast/toast.js` | `components/toast.css` | `.toast` |
| Skeleton | (CSS only) | `components/skeleton.css` | `.skeleton-*` |

### Component Details

#### Topbar

Renders the top navigation bar with optional actions, view controls, and auth context.

```js
export function renderTopbar({
  showNewFolder,
  showSortFilter,
  showViewToggle,
  showSelectToggle,
  showChatToggle,
  auth,
  showSignOut,
} = {})
```

When `auth` is provided, the topbar shows workspace/user context; `showSignOut` adds the sign-out button (`#topbar-signout-btn`).

---

#### Auth Gate

Renders and wires the sign-in screen before app routes mount.

```js
export function renderAuthGateHTML({ mode, email, name, error, loading } = {})
export function queryAuthGateEls(root)
export function initAuthGate(els, { onSubmit, onForgotPassword, onResendVerification })
```

- `renderAuthGateHTML()` returns the auth screen markup.
- `queryAuthGateEls(root)` returns form/input/button refs.
- `initAuthGate(els, { onSubmit, onForgotPassword, onResendVerification })` handles sign-in/sign-up submit, mode switching, forgot-password action, email-verification resend action, and loading/error/info states; returns a disposer.

---

#### Assistant Shell

Shared interaction rail mounted in the right sidebar and reused across Home and Folder views.

```js
export function renderAssistantShellHTML({ captureMode = "home", mode = "save", contextLabel = "All notes" } = {})
export function queryAssistantShellEls(root)
export function initAssistantShell(els, { initialMode, initialContextLabel, onModeChange })
```

- `renderAssistantShellHTML()` composes the mode switch (`Save`/`Ask`), context chip, and persistent unified composer bar.
- `queryAssistantShellEls(root)` returns the shell controls and pane refs.
- `initAssistantShell(...)` manages mode state and emits `onModeChange(mode)` when users switch modes; page controllers can route composer submit behavior based on active mode.

---

#### Composer

The note-capture input area. Supports a `home` mode and a `folder` mode.

```js
export function renderComposer({ mode = "home" } = {})
export function initComposerAutoResize(mountNode)
```

- `renderComposer()` returns HTML string with a `<textarea>`, submit button, and capture-type controls.
- `initComposerAutoResize(mountNode)` attaches an `input` listener that auto-grows the textarea; returns a disposer function.

---

#### Home Folder Grid

Renders the grid of folder pills on the home page.

```js
export function renderHomeFolderGrid()
```

Returns HTML string. Folder pills are rendered dynamically by the home page after fetching folders from the API.

---

#### Home Recent List

Provides both the compact inline recents strip (in the main pane) and the dedicated right chat rail (in the sidebar).

```js
export function renderRecentInlineStripHTML({ title = "Recent" } = {})
export function renderHomeRecentList()
```

- `renderRecentInlineStripHTML(...)` renders the horizontal recents row with refresh control.
- `renderHomeRecentList()` renders the full-height right sidebar chat container; the unified `Save/Ask` assistant shell is mounted under it by page controllers.

---

#### Folder Hero Toolbar

The hero section at the top of a folder page: folder name, color swatch, description, and action buttons.

```js
export function renderFolderHeroToolbar({
  folderName,
  folderDescription,
  folderColor,
  folderSymbol,
  showDeleteAction,
})
```

Returns HTML string. Includes `+ Folder`, `Share`, `Activity`, `Edit`, and optional delete actions.

---

#### Folder Activity Modal

Compact modal used by folder pages to show live activity events on demand.

```js
export function renderFolderActivityModalHTML()
export function queryFolderActivityModalEls(root)
export function renderFolderActivityModalItems(els, items)
export function openFolderActivityModal(els, { title, items })
export function closeFolderActivityModal(els)
export function initFolderActivityModal(els, { onClose, onRefresh })
```

---

#### Folder Item Grid

Renders the grid of note items within a folder.

```js
export function renderFolderItemGrid()
```

Returns HTML string. Items are populated dynamically after API fetch.

---

#### Item Modal

Full-screen modal for viewing a single note's details, source actions, and contextual comments.

```js
export function renderItemModalHTML()
export function queryItemModalEls(root)
export function openItemModal(els, note)
export function closeItemModal(els)
export function initItemModalHandlers(els, { onClose, onSave, onAddComment, onChatAbout })
```

**Usage example:**

```js
import {
  renderItemModalHTML,
  queryItemModalEls,
  openItemModal,
  closeItemModal,
  initItemModalHandlers,
} from "./components/item-modal/item-modal.js";

// In shell template:
// ${renderItemModalHTML()}

// In queryElements:
// ...queryItemModalEls(root)

// Wire handlers:
const cleanup = initItemModalHandlers(els, {
  onClose: () => closeItemModal(els),
  onAddComment: async (noteId, text) => apiClient.addNoteComment(noteId, { text }),
  onChatAbout: (note) => chatPanel.startFromNote(note),
});

// Open for a specific note:
openItemModal(els, note);
```

---

#### Chat Panel

Right-side chat surface for grounded Q&A over saved notes, with source citations and optional web-source grounding.

```js
export function renderChatPanelHTML()
export function queryChatPanelEls(root)
export function initChatPanel(els, { apiClient, toast, onOpenCitation, onWorkspaceAction, store })
```

`initChatPanel()` returns controls for `askQuestion(...)`, `clearConversation()`, `startFromNote(note, { autoSubmit })`, and `dispose()`.
Header controls expose an icon-only `New chat` action (clear conversation history/citations and reset composer attachment state).
While a response is in progress (including tool calls), the composer is locked and a pending status line is shown so users cannot submit overlapping requests.
When `onOpenCitation` is provided, citation cards expose `Open item` for in-app context. If a source URL exists, `Open source` opens the original link in a new tab.
When web search is used by the backend, URL sources are rendered in a dedicated `Web sources` section under citations.
When chat tools create a file/image item, the panel automatically opens that newly created item view.
Assistant responses are rendered via the shared Markdown service (`services/markdown.js`), so headings, lists, tables, code fences, and links render consistently with the rest of the app while remaining sanitized.
Chat messages/citations persist across page refresh via workspace/user-scoped local storage and are restored during app-shell bootstrap.
The panel and controls use touch-target tokens (`--tap-target`, `--tap-target-mobile`) so close/send/citation actions remain comfortable on small screens.

---

#### Markdown Editor

Rich text editor surface used on item detail pages while persisting Markdown under the hood.

```js
export function createMarkdownEditor(initialValue, { placeholder, showToolbar } = {})
```

- Toolbar uses compact SVG actions for text style, heading, list variants (bulleted, numbered, checklist), list indent/outdent, quote, link, and horizontal rule.
- Checklist items are editable in-place and serialize to Markdown task list syntax (`- [ ]` / `- [x]`).
- Markdown shortcuts entered directly by users still auto-transform inline (for example `**bold**`, links, and checklist triggers).

---

#### Move Modal

Reusable modal for selecting a destination folder during move actions.

```js
export function renderMoveModalHTML()
export function queryMoveModalEls(root)
export function renderMoveModalSuggestions(els, suggestions, currentValue)
export function openMoveModal(els, options)
export function closeMoveModal(els)
export function setMoveModalLoading(els, loading)
export function initMoveModalHandlers(els, { onClose, onSubmit, onInput, onSuggestionPick })
```

The modal is safe-area aware on mobile and supports stacked action buttons on very narrow viewports.

---

#### Activity Modal

Reusable modal for item timeline review (comments + version edits), including version preview/restore and in-modal comment capture.

```js
export function renderActivityModalHTML()
export function queryActivityModalEls(root)
export function openActivityModal(els, options)
export function closeActivityModal(els)
export function initActivityModalHandlers(els, { onClose, onRestoreVersion, onAddComment })
```

This modal is used by the item detail page so the main item surface stays focused on content editing.

---

#### Action Menu

Reusable compact menu used for per-item actions in dense list/grid surfaces.

```js
export function createActionMenu({ ariaLabel, actions })
export function closeAllActionMenus(root)
```

The menu auto-repositions (`left`/`up`) when near viewport edges to stay fully visible on mobile and narrow layouts.
Trigger and item sizing follow tap-target tokens to improve one-handed mobile use.

---

#### Folder Modal

Modal for creating or editing a folder. Includes a color picker and optional kind selector.

```js
export function renderFolderModalHTML({ showKindRow = false } = {})
export function queryFolderModalEls(root)
export function openFolderModal(els, { color = "green", kind = "folder" } = {})
export function closeFolderModal(els)
export function getSelectedFolderColor(els)
export function initFolderModalHandlers(els, { onClose, onColorSelect })
```

---

#### Inline Search

Embedded search input with result rendering. Used inside the folder page and home page.

```js
export function renderInlineSearchHTML({ placeholder = "Search..." } = {})
export function queryInlineSearchEls(root)
export function renderSearchResults(container, results, { onOpen, onDelete })
export function clearSearch(els, renderDefault)
export function initInlineSearchHandlers(els, { onInput, onClear, onKeydown })
```

---

#### Sort/Filter

Dropdown for sorting and filtering notes. Renders inline within the topbar.

```js
export function renderSortFilterHTML({ currentSort = "newest", currentFilter = "all" } = {})
export function querySortFilterEls(root)
export function initSortFilter(els, { onSortChange, onFilterChange, onToggle })
export function toggleSortFilterDropdown(els)
export function closeSortFilterDropdown(els)
```

Note: Sort/Filter CSS rules live inside `topbar.css`, not in a separate file.

---

#### Toast

Global toast notification. Rendered once in `index.html` as `<div id="toast">`.

```js
export function showToast(message, tone = "success", store)
```

- `tone` can be `"success"` or `"error"`.
- Automatically hides after a timeout.

---

#### Skeleton (CSS only)

Loading placeholder styles. No JS component -- just CSS classes (`skeleton-*`) applied directly in page templates.

---

## 3. Shared Services

All service files live under `public/app/services/`.

### `services/api-client.js`

Factory function that returns an HTTP client wrapping `fetch` for the REST API.

```js
export function createApiClient({ adapterDebug = false } = {})
```

**Returned methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `health()` | `() => Promise` | GET `/api/health` |
| `fetchNotes()` | `({ query, project, limit } = {}) => Promise` | GET `/api/notes` with query params |
| `saveNote()` | `(payload) => Promise` | POST `/api/notes` |
| `updateNote()` | `(id, payload) => Promise` | PUT `/api/notes/:id` |
| `deleteNote()` | `(id) => Promise` | DELETE `/api/notes/:id` |
| `batchDeleteNotes()` | `(ids) => Promise` | POST `/api/notes/batch-delete` |
| `batchMoveNotes()` | `(ids, project) => Promise` | POST `/api/notes/batch-move` |
| `ask()` | `(payload) => Promise` | POST `/api/chat` |
| `context()` | `(payload) => Promise` | POST `/api/context` |
| `fetchTasks()` | `({ status } = {}) => Promise` | GET `/api/tasks` |
| `createTask()` | `(payload) => Promise` | POST `/api/tasks` |
| `updateTask()` | `(id, payload) => Promise` | PUT `/api/tasks/:id` |
| `deleteTask()` | `(id) => Promise` | DELETE `/api/tasks/:id` |
| `fetchFolders()` | `({ parentId } = {}) => Promise` | GET `/api/folders` |
| `createFolder()` | `(payload) => Promise` | POST `/api/folders` |
| `getFolder()` | `(id) => Promise` | GET `/api/folders/:id` |
| `updateFolder()` | `(id, payload) => Promise` | PUT `/api/folders/:id` |
| `deleteFolder()` | `(id) => Promise` | DELETE `/api/folders/:id` |
| `fetchSubfolders()` | `(id) => Promise` | GET `/api/folders/:id/children` |
| `fetchTags()` | `() => Promise` | GET `/api/tags` |
| `renameTag()` | `(oldTag, newTag) => Promise` | POST `/api/tags/rename` |
| `deleteTag()` | `(tag) => Promise` | DELETE `/api/tags/:tag` |
| `fetchStats()` | `() => Promise` | GET `/api/stats` |
| `exportUrl()` | `({ project, format } = {}) => string` | Build export download URL |
| `subscribeToEvents()` | `(onEvent) => unsubscribe` | SSE at `/api/events` (events: `job:start`, `job:complete`, `job:error`, `connected`) |

---

### `services/mappers.js`

Data transformation and presentation utilities.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `normalizeSourceType(value)` | `string => string` | Canonicalize source type label |
| `normalizeCitationLabel(value)` | `string => string` | Canonicalize citation label |
| `snippet(text, limit)` | `(string, number) => string` | Truncate text with ellipsis |
| `normalizeNote(raw, index)` | `(object, number) => object` | Map raw API note to frontend shape |
| `normalizeCitation(raw, index)` | `(object, number) => object` | Wrap note in `{ rank, score, note }` |
| `adaptHealthResponse(payload)` | `object => object` | Transform health-check response |
| `adaptNotesResponse(payload)` | `object => object` | Transform notes listing response |
| `adaptAnswerResponse(payload, kind)` | `(object, string) => object` | Transform chat/context response |
| `createMockSeedNotes()` | `() => array` | Generate mock notes for offline mode |
| `filterAndRankMockNotes(mockNotes, opts)` | `(array, object) => array` | Client-side search over mocks |
| `buildLocalFallbackNote(payload)` | `object => object` | Build a local-only note when API is down |
| `buildMockChatAnswer(mockNotes, question, project)` | `(array, string, string) => object` | Mock chat answer |
| `buildMockContext(mockNotes, task, project)` | `(array, string, string) => object` | Mock context answer |
| `conciseTechnicalError(error, contextLabel)` | `(Error, string) => string` | Format error for user display |
| `buildNoteTitle(note)` | `object => string` | Derive display title from note |
| `buildContentPreview(note)` | `object => string` | Short content preview for cards |
| `buildNoteDescription(note)` | `object => string` | Longer description for detail views |
| `buildSummaryPreview(note, maxChars)` | `(object, number) => string` | Truncated summary text |
| `formatScore(score)` | `number => string` | Format relevance score |
| `formatMeta(note, detailed)` | `(object, boolean) => string` | Format metadata line |
| `compactUrl(urlString, maxLen)` | `(string, number) => string` | Shorten URL for display |
| `formatSourceText(url)` | `string => string` | Human-readable source label |
| `extractStandaloneUrl(text)` | `string => string\|null` | Pull a URL from note content |
| `inferCaptureType(content, imageDataUrl)` | `(string, string) => string` | Guess capture type (text, link, image, file) |

---

### `services/markdown.js`

Shared markdown renderer used by chat, item detail, and the rich text editor's markdown import/shortcut rendering path.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `renderMarkdown(text)` | `string => string` | Parse Markdown (GFM + line breaks) and return sanitized HTML |
| `renderMarkdownInto(container, text)` | `(HTMLElement, string) => void` | Render sanitized markdown into an element and apply `.markdown-body` |

Security behavior: unsafe tags are removed, unsafe attributes are stripped, `javascript:`/unsafe protocols are blocked, and safe links are forced to `target="_blank"` with hardened `rel`.

---

### `services/icons.js`

Central icon registry for web UI symbols. Components should render icons through this service instead of inlining SVG markup.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `renderIcon(name, options)` | `(string, object) => string` | Return SVG markup by icon key (`size`, `className`, accessibility label/title, stroke width) |
| `noteTypeIconName(type)` | `string => string` | Map capture types (`text`, `file`, `image`, `link`) to canonical icon keys |

Why this exists:
- Ensures consistent iconography across toolbar, chat, modals, breadcrumbs, item detail, and note cards.
- Makes icon swaps/rebranding a single-file change in `services/icons.js`.

---

### `services/chat-persistence.js`

Workspace/user-scoped chat persistence helpers used by `main.js` during app bootstrap/signout.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `buildChatStorageKey(session)` | `object => string` | Build stable key per workspace + user |
| `sanitizeChatState(state)` | `object => { chatMessages, chatCitations }` | Enforce bounded/safe persisted shape |
| `getBrowserStorage()` | `() => Storage \| null` | Resolve `window.localStorage` safely |
| `loadPersistedChatState(storage, session)` | `(Storage, object) => object \| null` | Read and sanitize persisted chat snapshot |
| `savePersistedChatState(storage, session, state)` | `(Storage, object, object) => void` | Persist sanitized chat snapshot |
| `clearPersistedChatState(storage, session)` | `(Storage, object) => void` | Remove persisted chat snapshot |

---

### `services/note-utils.js`

Note-specific UI helpers.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `relativeTime(dateString)` | `string => string` | "2 hours ago", "3 days ago", etc. |
| `iconTypeFor(note)` | `object => string` | Map note to icon type key |
| `fileToDataUrl(file)` | `File => Promise<string>` | Read file as data URL |
| `isProcessedNote(note)` | `object => boolean` | Check if note has been enriched |
| `deleteIconMarkup()` | `() => string` | Trash icon markup (delegates to `services/icons.js`) |
| `compactInlineText(value)` | `string => string` | Collapse whitespace for inline display |
| `buildModalSummary(note)` | `object => string` | Summary HTML for item modal |
| `buildModalFullExtract(note)` | `object => string` | Full-extract HTML for item modal |
| `noteTypeIconMarkup(type)` | `string => string` | Capture-type icon markup (delegates to `services/icons.js`) |

---

### `services/folder-utils.js`

Folder metadata and color utilities.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `FOLDER_COLOR_TOKENS` | `string[]` | `["green","blue","purple","orange","pink","red","yellow"]` |
| `FOLDER_SYMBOL_OPTIONS` | `string[]` | `["DOC","PLAN","CODE","LINK","MEDIA","NOTE"]` |
| `normalizeFolderColor(value, fallback)` | `(string, string) => string` | Validate/fallback folder color |
| `normalizeFolderSymbol(value, fallback)` | `(string, string) => string` | Validate/fallback folder symbol |
| `fallbackColorForFolder(name)` | `string => string` | Deterministic color from folder name |
| `normalizeFolderDrafts(rawDrafts)` | `array => array` | Clean up draft folder data |
| `resolveFolderMeta(folderName, draftFolders)` | `(string, array) => object` | Merge draft + API folder metadata |

---

### `services/keyboard.js`

Global keyboard shortcut handler.

```js
export function initKeyboardShortcuts({ onSearch, onComposer, onEscape } = {})
```

Returns a disposer function. Default bindings:

- `/` or `Cmd+K` -- focus search
- `N` -- focus composer
- `Escape` -- dismiss active overlay

---

## 4. Patterns & Conventions

### Component Pattern

Every component follows a three-part contract:

1. **`render{Name}HTML(props?)`** -- Pure function returning an HTML template string. No side effects.
2. **`query{Name}Els(root)`** -- Receives a mounted DOM node, returns an object of element references (e.g. `{ btn, input, list }`).
3. **`init{Name}(els, callbacks)`** -- Attaches event listeners and behavior. Returns a **disposer function** that removes all listeners.

Some components add `open{Name}()` / `close{Name}()` for imperative show/hide control (modals, dropdowns).

### Page Lifecycle

Pages export a single `mount({ mountNode, navigate, route })` function that:

1. Renders HTML into `mountNode.innerHTML`.
2. Queries element refs.
3. Initializes components and pushes disposers into a `disposers[]` array.
4. Sets an `isMounted` flag to `true`.
5. Returns a cleanup function that sets `isMounted = false` and calls every disposer.

The `isMounted` guard prevents async callbacks from mutating the DOM after unmount.

Helper pattern used inside pages:

```js
function on(el, event, handler) {
  el.addEventListener(event, handler);
  disposers.push(() => el.removeEventListener(event, handler));
}
```

### State Management

A lightweight store with shallow-merge semantics:

```js
store.getState()           // read current state
store.setState(patch)      // shallow merge patch into state
store.subscribe(listener)  // called on every setState; returns unsubscribe
```

No external state library. State is page-local or passed via the store.

### CSS Naming

BEM-lite with a component prefix:

```
.component-element
.component-element--modifier
```

Examples: `.composer-textarea`, `.folder-pill-label`, `.item-modal-overlay--visible`.

### No npm Dependencies

The entire frontend is vanilla JS with ESM `import` statements. No bundler, no transpiler, no framework. The browser loads modules directly.

### Accessibility

- Modals use `role="dialog"`, `aria-hidden`, and focus trapping.
- Interactive elements have `aria-label` and `aria-expanded` where applicable.
- Toast uses `role="status"` and `aria-live="polite"`.
- Keyboard navigation is supported for search, composer focus, and modal dismiss.

---

## 5. Adding a New Component (Checklist)

1. Create `public/app/components/{name}/{name}.js`
2. Create `public/styles/components/{name}.css`
3. Add a `<link rel="stylesheet" href="/styles/components/{name}.css" />` tag to `public/index.html`
4. Export `render{Name}HTML()`, `query{Name}Els()`, `init{Name}()`
5. Use `.{name}-*` as the CSS class prefix
6. Use design tokens for all values: `--font-size-*`, `--weight-*`, `--leading-*`, `--z-*`, color tokens -- never hardcode
7. If the component is a modal, also export `open{Name}()` and `close{Name}()` functions
8. Return a disposer function from `init{Name}()` so the page can clean up listeners
9. Update this design doc with the new component entry
