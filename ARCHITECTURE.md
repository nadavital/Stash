# Stash Architecture

> Technical blueprint for the Stash discovery engine

---

## Data Model

### Entities (Shared Content)

Canonical content items, deduplicated by URL:

```
entities
├── id (uuid)
├── canonical_url (unique)
├── title
├── description
├── image_url
├── type (article, song, event, recipe, video, place, product, social_post)
├── source_name
├── primary_emoji
│
├── # AI-Generated (enrichment)
├── summary (2-3 sentences)
├── tags (text[])
├── vibe_tags (text[])
├── suggested_prompts (text[])
├── embedding (vector for search)
│
├── # Type-Specific Metadata (JSONB)
├── type_metadata: {
│   article: { read_time, author, ... },
│   song: { artist, album, duration, ... },
│   recipe: { cook_time, servings, difficulty, ... },
│   event: { date, time, venue, ... },
│   place: { address, hours, rating, ... },
│   ...
│ }
│
├── # For integrations
├── apple_music_id (nullable)
├── spotify_id (nullable)
├── google_place_id (nullable)
│
├── enriched_at
├── created_at
└── updated_at
```

### Stash Items (User's Relationship to Content)

```
stash_items
├── id (uuid)
├── user_id (fk users)
├── entity_id (fk entities)
├── status (active, archived, deleted)
├── liked (boolean, nullable)        — explicit taste signal
├── notes (text)
├── source (share_extension, in_app, ai_recommendation, friend_share)
├── saved_at
├── opened_at                        — first engagement
├── last_viewed_at                   — most recent engagement
├── view_count (int)                 — number of opens (return visits = high value)
├── total_view_time_seconds (int)    — cumulative engagement time
└── updated_at
```

**Engagement Philosophy:** Items are assets, not tasks. There is no "Done" state.
Engagement is tracked implicitly (opens, time spent, returns) to feed the taste
profile without requiring users to manage their stash.

### AI Recommendations

Content AI found for user (not yet saved):

```
ai_recommendations
├── id (uuid)
├── user_id
├── entity_id (fk entities, nullable if not created yet)
├── external_url (if entity not created)
├── reason (text) — "Because you liked X"
├── score (float) — relevance score
├── discovery_date (date) — which daily batch
├── shown_at
├── dismissed_at
├── saved_at (if user saved it)
└── created_at
```

### Taste Profiles (Invisible to User)

```
taste_profiles
├── id (uuid)
├── user_id (unique)
├── embedding (vector) — high-dimensional taste representation
├── top_interests (text[]) — extracted topics
├── preferred_sources (text[]) — favorite websites/creators
├── engagement_patterns (JSONB) — time of day, content types, etc.
├── last_computed_at
└── created_at
```

### User Interactions (Event Log)

Tracks all actions for taste profile computation:

```
user_interactions
├── id (uuid)
├── user_id
├── entity_id
├── event_type (save, like, unlike, open, view_end, share, ask_stash, dismiss_recommendation)
├── metadata (JSONB) — context about the interaction
│   └── For view_end: { duration_seconds, scroll_depth, ... }
└── created_at
```

**Key Events:**
- `open` — User opened detail view (engagement start)
- `view_end` — User left detail view (captures duration)
- `like/unlike` — Explicit taste signal
- `share` — Social signal (high value)
- `ask_stash` — Deep engagement with AI about this item

### Friendships

```
friendships
├── id (uuid)
├── user_id
├── friend_id
├── status (pending, accepted, blocked)
├── taste_similarity (float, 0-1, computed from embeddings)
├── common_interests (text[])
├── created_at
└── similarity_computed_at
```

### Shares

```
shares
├── id (uuid)
├── from_user_id
├── to_user_id
├── entity_id
├── note (text, optional)
├── shared_at
├── viewed_at (nullable)
└── created_at
```

---

## Backend Architecture

### Supabase Edge Functions

All business logic runs as Supabase Edge Functions (TypeScript/Deno).

**Location:** `supabase/functions/`

#### Core Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `create-item` | Save URL, trigger enrichment, return item_id | ✅ Exists |
| `enrich-entity` | AI enrichment (summary, tags, embedding, metadata) | ✅ Exists |
| `feed-today` | Generate Home feed (saves + AI recs + friend shares) | ✅ Exists (needs AI recs) |
| `chat-with-stash` | AI conversation with semantic search | ✅ Exists |
| `item-actions` | Like/unlike/done/delete | ✅ Exists |
| `share-item` | Share with friend + notification | ✅ Exists |
| `friends` | Friend management (add, accept, list, remove) | ✅ Exists |
| `profile-overview` | User stats and profile data | ✅ Exists |

#### New Functions Needed

| Function | Purpose | Priority |
|----------|---------|----------|
| `daily-discovery` | Background job: find new content based on taste | **High** |
| `search-intent` | Detect intent (find saved vs. discover new) and route | **High** |
| `compute-taste-profile` | Update user embedding from interactions | **Medium** |
| `match-music` | Match URLs to Apple Music catalog | **Medium** |
| `rank-friends-for-item` | Sort friends by taste match for sharing | **Low** |

### Shared Utilities

**Location:** `supabase/functions/_shared/`

- `supabase-client.ts` — Client creation, auth helpers
- `gemini-client.ts` — Gemini AI calls (chat, embeddings, enrichment)
- `types.ts` — Shared TypeScript types

---

## AI System

### Model

**Current:** Gemini (free credits for testing)
**Future:** Open to OpenAI, Claude, or on-device models (Apple Intelligence)

### Key Operations

#### 1. Content Enrichment
**Trigger:** When user saves a URL
**Process:**
1. Fetch URL content
2. Detect content type (article, song, recipe, etc.)
3. Extract metadata (author, read time, cook time, etc.)
4. Generate summary (2-3 sentences)
5. Create tags and vibe descriptors
6. Suggest prompts for "Ask Stash"
7. Generate embedding (vector for semantic search)
8. Store in `entities` table

**Latency Target:** < 5 seconds

#### 2. Daily Discovery
**Trigger:** Background cron job (once per day per user)
**Process:**
1. Load user's taste profile (embedding + preferences)
2. Search web for content matching taste
3. Find content from high-similarity friends
4. Score and rank candidates
5. Select top N items (configurable)
6. Create `ai_recommendations` records
7. Generate digest explaining top picks

**Latency:** Async, doesn't matter

#### 3. Semantic Search
**Trigger:** User query in Search tab
**Process:**
1. Generate embedding for query
2. Vector similarity search against user's stash
3. Return top K matching items
4. Pass to LLM with conversation history
5. LLM generates response with context

**Latency Target:** < 3 seconds

#### 4. Intent Detection
**Trigger:** User query in Search tab
**Process:**
1. Analyze query structure and keywords
2. Classify intent: find_saved, discover_new, ask_question
3. Route to appropriate UI handler
4. UI adapts (mini card, stack, chat)

**Latency Target:** < 1 second

#### 5. Taste Profile Computation
**Trigger:** Background job (weekly) or after N interactions
**Process:**
1. Load user's interaction history
2. Extract entities they've saved, liked, engaged with
3. Compute aggregate embedding (weighted average)
4. Extract top interests (topic modeling)
5. Identify preferred sources
6. Analyze engagement patterns (time of day, content types)
7. Update `taste_profiles` table

**Latency:** Async, doesn't matter

---

## iOS App Architecture

### Tech Stack

- **iOS 26.0+** (required for Liquid Glass and Tab API)
- **Swift 6.2+**
- **SwiftUI** (100% SwiftUI, no UIKit)
- **Modern Concurrency** (async/await, no GCD)

### Code Organization

```
Stash/
├── Core/                          # Shared infrastructure
│   ├── Extensions/                # Swift extensions
│   ├── Models/                    # Data models
│   ├── Services/                  # Business logic
│   │   ├── APIClient.swift        # All API calls
│   │   ├── AuthManager.swift      # Auth state
│   │   └── ItemActionsManager.swift # Optimistic updates
│   └── Theme/                     # Design system
│       ├── StashTheme.swift       # Colors, shadows, motion
│       ├── Typography.swift       # Type system
│       └── Spacing.swift          # Layout spacing
├── Features/                      # Feature modules (MVVM)
│   ├── Auth/                      # Authentication & onboarding
│   ├── Home/                      # Discovery feed
│   ├── You/                       # User library & friends
│   ├── Search/                    # AI intelligence hub
│   └── ItemDetail/               # Content detail views
├── Shared/                        # Reusable UI components
│   └── Components/
│       ├── SynapseLens/          # AI orb component
│       └── StashGlyph/           # Brand icon
└── MainTabView.swift              # Tab navigation container
```

### Architecture Patterns

**MVVM Throughout:**
- ViewModels are `@MainActor @Observable` classes with `@Published` properties
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
- `@StateObject` for ViewModel ownership (deprecated pattern, use @State)
- `@EnvironmentObject` for app-wide state (AuthManager)

**Optimistic Updates:**
- `ItemActionsManager` provides immediate UI feedback
- Rollback on API failure via NotificationCenter broadcasts

---

## Native Integrations

### Current Priority

| Integration | Purpose | Status | Framework |
|-------------|---------|--------|-----------|
| **WKWebView** | In-app article/web content rendering | ✅ Implemented | WebKit |
| **MusicKit** | Play songs/albums in-app | 🔮 Planned | MusicKit |
| **MapKit** | Map previews for restaurants/places | 🔮 Planned | MapKit |
| **EventKit** | Add events to Calendar | 🔮 Planned | EventKit |
| **AVKit** | Video playback | 🔮 Planned | AVKit |
| **Contacts** | Find friends via contacts sync | 🔮 Planned | Contacts |

### Future Integrations

- **Reservation platforms** (OpenTable, Resy) — Deep links or web embeds
- **Ticket purchasing** (concerts, movies) — Deep links or APIs
- **Spotify SDK** — For non-Apple Music users
- **Shortcuts** — Automation triggers (new save, friend share)
- **Safari Extension** — Save from Safari with one click

---

## Technical Standards

### Swift/SwiftUI

**CRITICAL:** Always follow `.claude/SWIFT_GUIDE.md`

**Key Rules:**
- iOS 26.0+, Swift 6.2+
- `@Observable` classes marked `@MainActor` (never `ObservableObject`)
- Modern Swift concurrency (no GCD)
- `foregroundStyle()` not `foregroundColor()`
- `clipShape(.rect(cornerRadius:))` not `cornerRadius()`
- `Tab` API not `tabItem()`
- Prefer static member lookup (`.circle` not `Circle()`)
- Avoid force unwraps and force try

### Design System

**CRITICAL:** Always use `StashTheme`, `Typography`, `Spacing`

**Read these guides:**
1. `SWIFT_GUIDE.md` — Modern Swift conventions (ALWAYS)
2. `DESIGN_GUIDE.md` — Visual style, when to use glass
3. `LIQUID_GLASS.md` — Technical glass implementation

**StashTheme Usage:**

```swift
// Colors
.foregroundStyle(StashTheme.Colors.textPrimary)
.background(StashTheme.Colors.surface)

// Spacing
.padding(StashTheme.Spacing.md)

// Radius
.clipShape(.rect(cornerRadius: StashTheme.Radius.card))

// Shadows
.shadow(color: StashTheme.Shadow.soft.color,
        radius: StashTheme.Shadow.soft.radius,
        y: StashTheme.Shadow.soft.y)

// Motion
.animation(.easeInOut(duration: StashTheme.Motion.medium), value: someValue)
```

### Code Organization

- **MVVM throughout** — ViewModels are `@MainActor @Observable`
- **One type per file**
- **Group by feature** (not by type)
- **Break views into components** (View structs, not computed properties)

---

## For AI Coding Agents

When working on Stash:

1. **Read the guides** — `SWIFT_GUIDE.md`, `DESIGN_GUIDE.md`, `LIQUID_GLASS.md`
2. **Follow modern Swift strictly** — iOS 26+, Swift 6.2+
3. **Use the design system** — `StashTheme` for colors, spacing, typography
4. **Maintain MVVM** — ViewModels handle logic, Views stay declarative
5. **Prototype fearlessly** — Suggest new ideas, don't be afraid to discard existing ones
6. **Content first** — Detail views ARE the content
7. **AI beyond chat** — Think ambient intelligence, not chatbot
8. **Keep it native** — Follow iOS conventions and Liquid Glass aesthetic

### Before Making Changes

- Read relevant guides (`SWIFT_GUIDE.md` always, others as needed)
- Check existing files for patterns
- Use `StashTheme` for all colors/spacing
- Test on iOS 26+

### When Stuck

- **Ask questions** — Clarify before building
- **Prototype multiple solutions** — Test, compare, iterate
- **Suggest new approaches** — Don't be constrained by the current implementation

---

## Performance Considerations

### AI Operations Latency Targets

| Operation | Target | Acceptable | Notes |
|-----------|--------|------------|-------|
| Content enrichment | < 5s | < 10s | Runs on save |
| Semantic search | < 2s | < 3s | User waiting |
| Intent detection | < 1s | < 2s | UI transition |
| Chat response | < 3s | < 5s | User waiting |
| Daily discovery | N/A | N/A | Background job |
| Taste profile compute | N/A | N/A | Background job |

### Caching Strategy

- **API responses:** Cache in `APIClient` (in-memory + disk)
- **Images:** `ImageCache` (Kingfisher or custom)
- **Embeddings:** Store in database, don't recompute
- **Taste profiles:** Update weekly or after N interactions

### Background Jobs

- **Daily discovery:** Run once per day per user (Supabase cron)
- **Taste profile updates:** Run weekly or after 10+ new interactions
- **Friend similarity:** Recompute when either user's profile updates

---

## Security & Privacy

### Data Storage

**What we store (AI-generated, transformative):**
- Summaries, TLDR, key insights
- Tags, vibe descriptors, suggested prompts
- Type metadata (facts: cook time, event date, etc.)
- Embeddings for search

**What we fetch live (copyright respecting):**
- Full article text (via WebView)
- Complete recipe instructions (via WebView)
- Video playback (official embeds)
- Music playback (MusicKit/Spotify SDKs)

**Detail views render original content** — we're a browser, not a publisher.

### Authentication

- Row Level Security (RLS) on all Supabase tables
- Anon key in iOS app
- Service role key only in Edge Functions
- Auth middleware in all endpoints

### API Keys

**Never commit:**
- API keys
- Supabase service role key
- `.env` files

**Use environment variables:**
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Gemini: `GEMINI_API_KEY`

---

## Testing Strategy

### Backend (Edge Functions)

- Unit tests for utility functions
- Integration tests for database operations
- Mock Gemini API in tests

### iOS App

- Unit tests for ViewModels
- UI tests for critical flows (save, share, search)
- Snapshot tests for visual regression

### AI Quality

- Evaluate enrichment quality (manual review)
- Track discovery relevance (user engagement metrics)
- Monitor search accuracy (user feedback)

---

## Deployment

### Backend

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy feed-today
```

### iOS App

- TestFlight for beta testing
- App Store when ready

### Database Migrations

```bash
# Create migration
supabase migration new add_taste_profiles

# Apply migrations
supabase db push
```

---

## Monitoring

### Key Metrics

- **Enrichment success rate** — % of saves successfully enriched
- **Search latency** — p50, p95, p99
- **Daily discovery engagement** — % of recommendations saved/dismissed
- **Friend sharing** — shares per user per week
- **Session depth** — items viewed per session

### Error Tracking

- Backend: Supabase logs + Sentry (future)
- iOS: Crash reporting (TestFlight, future: Sentry)

### Analytics

- PostHog or Mixpanel (future)
- Track key events: save, like, share, search, discovery_engaged
