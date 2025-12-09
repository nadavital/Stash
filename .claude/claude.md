# Stash - AI-Native Content Companion

> **Your personal content companion** — not just a manager, but a partner that surfaces value exactly when you need it.

This guide provides essential context about Stash's vision, architecture, and development standards to help AI assistants work efficiently and correctly within the codebase.

---

## Required Reading

Before coding, **understand the product** (root directory):

1. **`VISION.md`** — Product vision, principles, and what makes Stash different (read first)
2. **`ARCHITECTURE.md`** — Data models, backend functions, technical patterns (reference as needed)
3. **`ROADMAP.md`** — Current status and priorities (check what to build)

Then **read the technical guides** (`.claude/`):

4. **`SWIFT_GUIDE.md`** — Modern Swift 6.2 & iOS 26 conventions (CRITICAL - always follow)
5. **`LIQUID_GLASS.md`** — Technical implementation of glass effects (how to implement)
6. **`DESIGN_GUIDE.md`** — Visual style and when/where to use glass (design decisions)

**When working on UI:**
- Read `DESIGN_GUIDE.md` for design decisions (colors, spacing, when to use glass)
- Read `LIQUID_GLASS.md` for implementation (how to apply glass effects)
- Always follow `SWIFT_GUIDE.md` for all Swift/SwiftUI code

**When starting work:**
- Check `ROADMAP.md` for current priorities (Phase 1 focus)
- Reference `ARCHITECTURE.md` for data models and backend functions

---

## Core Philosophy & Vision

### Four Guiding Principles

1. **Card = Peek, Detail = Content** — Cards show AI-generated insights. Detail views ARE the content itself (not a link), with Stash controls layered on top.

2. **Deliver value inline** — Users shouldn't click to get value. Summaries, insights, and metadata appear directly in feed cards.

3. **One AI, always present** — No separate "AI tab." The Synapse Lens is ever-present, context-aware, available everywhere.

4. **Social through taste** — Friends are taste vectors. Stash suggests what to share with whom based on actual taste overlap.

### Design Principles

1. **Joy over utility** — Every interaction delightful
2. **Calm over busy** — One thing at a time, no visual overwhelm
3. **Smart over manual** — AI handles organization, users just save
4. **Personal over social** — Private by default
5. **Native over custom** — Follow iOS conventions, Liquid Glass aesthetic
6. **Content over chrome** — Detail views are content, not wrappers

### App Structure: Two Tabs + Search

- **Home** — Immersive feed of saved content with AI-enriched previews
- **You** — Items list, Shared With You, Friends
- **Search** (`.search` role) — Unified AI-powered search via Synapse Lens

---

## Architecture Overview

### Codebase Organization

```
Stash/
├── Core/                          # Shared infrastructure
│   ├── Extensions/                # Swift extensions
│   ├── Models/                    # Data models
│   ├── Services/                  # Business logic (APIClient, AuthManager, etc.)
│   └── Theme/                     # Design system (StashTheme, Typography, Spacing)
├── Features/                      # Feature modules (MVVM)
│   ├── Auth/                      # Authentication & onboarding
│   ├── Home/                      # Main immersive feed
│   ├── You/                       # User library & friends
│   ├── Search/                    # AI-powered search
│   └── ItemDetail/               # Content detail views
├── Shared/                        # Reusable UI components
│   └── Components/
│       ├── SynapseLens/          # AI orb component
│       └── StashGlyph/           # Brand icon
└── MainTabView.swift              # Tab navigation container
```

### Architecture Patterns

**MVVM Throughout:**
- ViewModels are `@MainActor` observable classes with `@Published` properties
- Views are declarative SwiftUI, UI-only logic
- ViewModels handle all business logic and API calls

**Shared Singletons:**
- `AuthManager.shared` — Authentication state and session management
- `APIClient.shared` — All Supabase Edge Function calls with caching
- `ItemActionsManager.shared` — Optimistic updates for like/done/delete

**Navigation:**
- `NavigationStack` with type-safe routing using `navigationDestination(for:)`
- Sheets and full-screen covers for modals

**State Management:**
- `@State` for local UI state
- `@StateObject` for ViewModel ownership
- `@EnvironmentObject` for app-wide state (AuthManager)

**Optimistic Updates:**
- `ItemActionsManager` provides immediate UI feedback
- Rollback on API failure via NotificationCenter broadcasts

---

## The Synapse Lens (AI Visual Identity)

The liquid bioluminescent orb is the soul of the app — Stash's AI companion.

**Visual Design:**
- Liquid particle system with metaball blur effect
- Glass overlay using `.glassEffect()`
- **Cosmic palette:** Deep violet (#5238B5), magenta, electric blue
- Configurable size (28pt–200pt+)
- Continuous breathing animation

**States:**
- **idle** — Gentle breathing, slow particles
- **listening** — Deep expansion (future: voice input)
- **thinking** — Fast particles, high energy
- **answering** — Steady flow

**Usage Throughout App:**
- Tab bar accessor (persistent, future)
- Search screen (200pt, prominent)
- Item detail "Ask Stash" button (56pt, floating)
- Anywhere AI interaction happens

**Implementation:** `Shared/Components/SynapseLens/SynapseLensView.swift`

---

## Design System

**ALWAYS use the design system** — ensures consistency across the app.

### StashTheme (`Core/Theme/StashTheme.swift`)

**Colors:**
```swift
// Backgrounds
.bg, .surface, .surfaceSoft, .surfaceElevated

// Text
.textPrimary, .textSecondary, .textMuted

// Brand
.accent         // Primary brand purple
.ai             // Deep Violet #5238B5 (Synapse Lens)

// Semantic
.success, .warning, .danger
```

All colors are adaptive (dark/light mode).

**Layout:**
```swift
StashTheme.Radius.card        // 16
StashTheme.Radius.sheet       // 24
StashTheme.Radius.button      // 999 (fully rounded)

StashTheme.Shadow.soft        // Subtle elevation
StashTheme.Motion.medium      // 0.22s (standard animations)
```

**Typography:** Use `StashTypography` for custom sizes or `Typography` for system aliases.

**Spacing:** Use `StashSpacing` for domain-specific spacing or `Spacing` for standard scale.

### Glass Effects (iOS 26 Liquid Glass)

```swift
.background(.ultraThinMaterial)
.glassEffect()
```

Use liberally for modern iOS aesthetic — buttons, overlays, cards.

---

## Key Features & Implementation Patterns

### Home Tab — Immersive Feed

**Purpose:** AI-curated feed with rich preview cards

**Card Design:**
- 480pt height, full-bleed background with gradient overlay
- Type-specific gradients, glass-effect action buttons
- Primary CTA uses tinted interactive glass

**Feed Logic:**
- Loads from `feed-today` Edge Function
- Sections: brainSnack (AI picks), fromFriends, byYou, forYou
- Backend handles sorting (temporal relevance, engagement, freshness, social signals)

### Search Tab — AI Interface

**Purpose:** Context-aware chat with the Synapse Lens

**UI:**
- Empty state: Large Synapse Lens (200pt) + suggested prompts
- Conversation view with message bubbles, glass input bar

**Chat Logic:**
- Calls `chat-with-stash` Edge Function with query + conversation history
- Backend performs vector search, returns AI response + referenced items

### ItemDetail — Content Consumption

**The Principle:**
> Card = Peek (AI summary)
> Detail = Content (actual webpage/player) + Stash Overlay

**Router (`Features/ItemDetail/Views/ItemDetailRouter.swift`):**
Routes to type-specific views:
- `RecipeDetailView` — Native recipe preview
- `SocialPostDetailView` — Native social post render
- `VideoDetailView` — Embedded video player
- `EventDetailView` — Map + calendar integration
- `ContentDetailView` — WebView for articles/generic URLs

**Standard Detail Structure:**
- Hero section (320pt) with image + metadata
- Share with friends (ranked by taste)
- AI summary card (summary, TLDR, insights)
- Type-specific actions (Read, Watch, Cook, etc.)
- Related items (horizontal scroll)
- Floating "Ask Stash" button (Synapse Lens, 56pt, bottom-right)
- Like/Dislike in toolbar (explicit taste signal)

**Engagement Tracking (Implicit):**
- `markOpened()` on view appear
- Track time spent on view disappear
- No "Done" button — items are assets, not tasks

**Ask Stash Flow:**
- Tap button → sheet with suggested prompts → calls `chat-with-stash` with item URL
- Gemini analyzes live content, no copyrighted content stored

---

## Backend (Supabase Edge Functions)

All business logic runs as Supabase Edge Functions (TypeScript/Deno).

**Location:** `supabase/functions/`

### Key Edge Functions

**`feed-today`** — Personalized feed generation
- Loads user's taste profile (persistent embedding)
- AI-powered discovery: finds items from high-similarity friends
- Generates AI subtitle using Gemini
- Returns sections: brainSnack, fromFriends, byYou, forYou

**`chat-with-stash`** — AI chat with semantic search
- Vector search user's items using query embedding
- Passes top 10 relevant items + conversation history to Gemini
- Returns AI response + referenced items (matched by quoted titles)

**`create-item`** — Save URL with AI enrichment
- Creates entity if new (dedupe by URL)
- Triggers `enrich-entity` function synchronously
- AI extracts: summary, TLDR, key insights, tags, metadata, embedding
- Returns item_id

**Other Functions:**
- `item-actions` — Like/unlike/delete/done
- `profile-overview` — User stats
- `friends` — Friend management
- `share-item` — Share with friends
- `search-items` — Semantic search
- `parse-interests` — Onboarding interest extraction
- `compute-taste-profile` — Background job for user embeddings

### Shared Utilities

**`supabase/functions/_shared/`**
- `supabase-client.ts` — Client creation + auth helpers
- `gemini-client.ts` — Gemini AI calls (chat, embeddings, enrichment)
- `types.ts` — Shared TypeScript types

### What We Store vs. Fetch Live (Legal Approach)

**Store (AI-Generated, Transformative):**
- Summaries, TLDR, key insights
- Tags, vibe descriptors, suggested prompts
- Type metadata (facts: cook time, event date, etc.)
- Embeddings for search

**Fetch Live (Copyright Respecting):**
- Full article text (via WebView)
- Complete recipe instructions (via WebView)
- Video playback (official embeds)
- Music playback (MusicKit/Spotify SDKs)

Detail views render original content — we're a browser, not a publisher.

---

## Development Standards

### Swift/SwiftUI Standards

**CRITICAL: Always follow `SWIFT_GUIDE.md`** — Modern Swift 6.2, iOS 26+ conventions.

**Key Rules:**
- Target iOS 26.0+, Swift 6.2+
- `@Observable` classes marked `@MainActor` (never `ObservableObject`)
- Modern Swift concurrency (no GCD)
- `foregroundStyle()` not `foregroundColor()`
- `clipShape(.rect(cornerRadius:))` not `cornerRadius()`
- `Tab` API not `tabItem()`
- `NavigationStack` not `NavigationView`
- Prefer static member lookup (`.circle` not `Circle()`)
- Avoid force unwraps and force try

### Code Organization

**MVVM Pattern:**
- ViewModels are `@MainActor @Observable` classes
- Views use `@State private var viewModel = ViewModel()`
- Load in `.task { }` modifier

**File Organization:**
- One type per file
- Use `// MARK: -` for sections
- Break views into `View` structs, not computed properties
- Group by feature, not by type

### Security

**Never Commit:**
- API keys, Supabase service role key, `.env` files

**Always:**
- Use Row Level Security (RLS) on all Supabase tables
- Anon key in iOS app, service role only in Edge Functions
- Auth middleware in all endpoints

---

## Common Development Tasks

### Add New Content Type

1. Add to `EntityType` enum
2. Update enrichment logic in `enrich-entity` Edge Function
3. Create type-specific detail view if needed
4. Update `ItemDetailRouter` routing
5. Design immersive card variant in `ImmersiveCard.swift`

### Add New Edge Function

1. `supabase functions new function-name`
2. Implement in `index.ts`
3. Add typed method to `APIClient.swift`
4. `supabase functions deploy function-name`

### Modify Feed Algorithm

Edit `supabase/functions/feed-today/index.ts`, adjust ranking/discovery logic, redeploy.

### Update Design System

Modify `Core/Theme/StashTheme.swift` — changes propagate app-wide.

---

## Essential File Reference

**Entry Points:**
- `StashApp.swift` — App lifecycle
- `MainTabView.swift` — Tab navigation

**Core Services (Read First):**
- `Core/Services/APIClient.swift` — All API interactions
- `Core/Services/AuthManager.swift` — Auth state
- `Core/Services/ItemActionsManager.swift` — Optimistic updates

**Design System (Use Everywhere):**
- `Core/Theme/StashTheme.swift` — Colors, radius, shadows, motion
- `Core/Theme/Typography.swift` — Type system
- `Core/Theme/Spacing.swift` — Layout spacing

**Feature Entry Points:**
- `Features/Home/Views/HomeView.swift` — Main feed
- `Features/Search/Views/SearchView.swift` — AI chat
- `Features/ItemDetail/Views/ItemDetailRouter.swift` — Content details

**Synapse Lens:**
- `Shared/Components/SynapseLens/SynapseLensView.swift`

**Backend:**
- `supabase/functions/feed-today/index.ts`
- `supabase/functions/chat-with-stash/index.ts`

---

## Guidelines for AI Assistants

When working on Stash:

1. **Read the guides first** — `.claude/SWIFT_GUIDE.md`, `LIQUID_GLASS.md`, `DESIGN_GUIDE.md`
2. **Follow `SWIFT_GUIDE.md` strictly** — Modern Swift 6.2, iOS 26+ conventions (CRITICAL)
3. **Use the design system** — StashTheme ensures consistency (see `DESIGN_GUIDE.md`)
4. **Implement glass correctly** — See `LIQUID_GLASS.md` for technical details
5. **Maintain MVVM** — ViewModels handle logic, Views stay declarative
6. **Keep it native** — Follow iOS conventions and Liquid Glass aesthetic
7. **AI-first thinking** — Synapse Lens is the soul of the app
8. **Follow existing patterns** — Check similar features for conventions
9. **Content over chrome** — Detail views ARE the content, not links to it
10. **Smart over manual** — AI organizes, users just save

### Before Making Changes

- **Read guides:** `SWIFT_GUIDE.md` (always), `DESIGN_GUIDE.md` (UI), `LIQUID_GLASS.md` (glass)
- Read relevant files to understand existing patterns
- Use StashTheme for all colors, spacing, typography
- Ensure ViewModels are `@MainActor` and use `@Observable`
- Test on iOS 26+ (minimum target)

### When Implementing UI

1. Check `DESIGN_GUIDE.md` for when/where to use glass and design decisions
2. Check `LIQUID_GLASS.md` for how to implement glass effects
3. Use tinted glass for primary actions (contextual prominence)
4. Follow `SWIFT_GUIDE.md` for all Swift/SwiftUI syntax

### Code Quality

- Break large views into smaller components
- Use semantic colors (adapt to dark mode)
- Provide accessibility labels
- Handle errors gracefully with user-facing messages
- Optimize for performance (lazy loading, caching)

**Additional context:**
- Product vision: `VISION.md` (root directory)
- Architecture & data models: `ARCHITECTURE.md` (root directory)
- Current priorities: `ROADMAP.md` (root directory)
- Technical guides: `.claude/SWIFT_GUIDE.md`, `LIQUID_GLASS.md`, `DESIGN_GUIDE.md`
