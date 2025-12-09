# Stash Roadmap

> Current status and implementation phases

---

## Current State

### What Exists ✅

**iOS App:**
- ✅ Three-tab structure (Home, You, Search)
- ✅ Home feed with immersive cards
- ✅ Detail views for major content types
- ✅ Search tab with Synapse Lens
- ✅ Share Extension (save to your stash)
- ✅ Authentication system
- ✅ Design system (StashTheme, Typography, Spacing)

**Backend:**
- ✅ `create-item` — Save URL and trigger enrichment
- ✅ `enrich-entity` — AI enrichment with Gemini
- ✅ `feed-today` — Generate Home feed (currently just user's saves)
- ✅ `chat-with-stash` — AI conversation with semantic search
- ✅ `item-actions` — Like/unlike/delete + engagement tracking
- ✅ `share-item` — Share with friend
- ✅ `friends` — Friend management
- ✅ `profile-overview` — User stats

### In Progress 🚧

- 🚧 Like/Dislike actions wired to backend (exists, needs testing)
- 🚧 Implicit engagement tracking (time spent, opens)
- 🚧 You tab redesign (structure exists, needs polish)
- 🚧 Detail view implementations (some types complete, others generic)

### Not Yet Built 🔮

**Critical for MVP:**
- 🔮 Daily AI discovery (background job)
- 🔮 Intent-aware search (dynamic UI based on query)
- 🔮 Detail view navigation (avoid home → detail loop)
- 🔮 AI recommendations in Home feed
- 🔮 You tab organization (AI-powered grouping)

**Social MVP:**
- 🔮 Add friends UI
- 🔮 Share to friend's stash (in-app flow)
- 🔮 "Shared With You" section
- 🔮 Share Extension: send to friends

**Nice-to-Have:**
- 🔮 MusicKit integration
- 🔮 MapKit integration
- 🔮 EventKit integration
- 🔮 Daily digest UI in Search tab
- 🔮 Custom discovery instructions

---

## Phase 1: Individual Experience (Current Focus)

**Goal:** Create a delightful individual experience. Users can save, consume, and discover content.

### Must-Have Features

#### Home Feed
- [x] Immersive cards with type-specific layouts
- [x] Vertical scroll
- [x] Primary action buttons
- [ ] AI recommendations blended into feed
- [ ] Smart sorting (relevance, time, context)
- [ ] Pull to refresh

#### Detail Views
- [x] Article detail (WebView)
- [x] Basic video detail
- [x] Basic music detail
- [x] Recipe detail
- [x] Event detail
- [x] Social post detail
- [ ] Restaurant detail with map
- [ ] Product detail
- [ ] Wire Like/Dislike to backend (persist taste signals)
- [ ] Implicit engagement tracking (opens, time spent)
- [ ] Navigation between items (TBD design)

#### Search/AI Tab
- [x] Synapse Lens animation
- [x] Basic chat interface
- [ ] Intent detection (find saved vs. discover new)
- [ ] Dynamic UI (mini card vs. stack vs. chat)
- [ ] Daily digest display
- [ ] Custom instructions

#### You Tab
- [ ] Redesigned profile header
- [ ] Your Stash list (searchable, filterable)
- [ ] AI-powered organization
- [ ] Filter chips (All, Articles, Music, etc.)
- [ ] Sort options (Recent, Alphabetical, Most Engaged)
- [ ] Settings screen

#### AI Features
- [x] Content enrichment on save
- [x] Semantic search
- [x] Chat with context
- [ ] Daily discovery (background job)
- [ ] Intent-aware routing
- [ ] Taste profile computation

### Backend Functions Needed

| Function | Status | Priority |
|----------|--------|----------|
| `daily-discovery` | 🔮 Not started | **High** |
| `search-intent` | 🔮 Not started | **High** |
| `compute-taste-profile` | 🔮 Not started | **Medium** |

### Timeline

**Target:** Phase 1 complete = ready for beta testing (individual experience only)

**Focus order:**
1. Daily AI discovery (makes Home feed valuable)
2. Intent-aware search (makes Search tab magical)
3. Detail view navigation (keeps users engaged)
4. You tab organization (makes library usable)

---

## Phase 2: Social & Discovery (Next)

**Goal:** Friends and AI discovery feel magical.

### Features

#### Social
- [ ] Add friends (handle, contacts, QR, invite link)
- [ ] Share to friend's stash (one-tap, AI-ranked)
- [ ] "Shared With You" section in You tab
- [ ] Share Extension: send to friends option
- [ ] Friend list with basic profiles
- [ ] Push notifications for shares (optional)

#### Advanced AI
- [ ] Daily digest in Search tab (expandable)
- [ ] Custom discovery instructions (conversational)
- [ ] Improved taste profile (more sophisticated)
- [ ] AI-powered share suggestions (future)

#### Home Feed Enhancements
- [ ] Friend shares blended into feed
- [ ] "Shared by [Name]" attribution
- [ ] More sophisticated sorting algorithm

### Backend Functions Needed

| Function | Status | Priority |
|----------|--------|----------|
| `rank-friends-for-item` | 🔮 Not started | **Medium** |
| Improved `feed-today` | 🚧 Needs friend shares | **High** |
| Share notifications | 🔮 Not started | **Medium** |

### Timeline

**Target:** Phase 2 complete = ready for public launch (social enabled)

---

## Phase 3: Native Integrations (Future)

**Goal:** Stash connects to the system.

### Integrations

- [ ] **MusicKit** — Play songs/albums in-app
- [ ] **EventKit** — Add events to Calendar
- [ ] **MapKit** — Map previews, directions for restaurants/places
- [ ] **Contacts** — Find friends via contacts sync
- [ ] **AVKit** — Enhanced video playback (PiP)
- [ ] **Safari Extension** — Save from Safari with one click

### Backend Functions Needed

| Function | Status | Priority |
|----------|--------|----------|
| `match-music` | 🔮 Not started | **Medium** |
| Contact sync | 🔮 Not started | **Low** |

### Timeline

**Target:** Add integrations one by one based on user feedback and usage patterns

**Priority order:**
1. MusicKit (saves of songs should be playable)
2. MapKit (restaurant saves need maps)
3. EventKit (event saves need calendar)
4. Rest as needed

---

## Phase 4: Advanced Features (Vision)

**Goal:** Stash becomes indispensable.

### Features

- [ ] Voice input (Synapse Lens listening state)
- [ ] Recipe cooking mode with timers
- [ ] Ticket purchasing (events, movies)
- [ ] Reservation booking (restaurants via OpenTable/Resy)
- [ ] Widgets (iOS Home Screen, Lock Screen)
- [ ] Watch app
- [ ] Shortcuts automation
- [ ] Safari Extension
- [ ] Friend profiles with taste overlap visualization
- [ ] Combined taste profiles (group recommendations)

### Timeline

**Target:** Build based on user requests and strategic priorities

---

## Key Decisions Pending

### Detail View Navigation (TBD)

**Problem:** Avoid "home → detail → home → detail" loop

**Options to prototype:**
1. Horizontal paging (swipe left/right)
2. Stack metaphor (swipe down to dismiss, reveals previous)
3. Floating mini-feed overlay
4. Auto-advance on Done/Like
5. Something new

**Next step:** Build 2-3 prototypes, test with users, pick winner

### Daily Discovery Cadence

**Current plan:** Once per day, background job

**Open questions:**
- What time of day?
- How many items?
- User-configurable?
- Silent vs. notification?

**Next step:** Start with defaults, iterate based on engagement

### Feed Refresh Strategy

**Options:**
1. Pull to refresh (manual)
2. Auto-refresh on app open
3. Periodic background refresh
4. Combination

**Next step:** Start with pull-to-refresh, add auto-refresh later

---

## Critical Path

To reach **beta-ready** (Phase 1 complete):

1. **Daily Discovery** → Makes Home feed valuable
2. **Intent-Aware Search** → Makes AI feel magical
3. **Detail Navigation** → Keeps users engaged
4. **You Tab Polish** → Makes library usable

To reach **launch-ready** (Phase 2 complete):

5. **Add Friends** → Enables social
6. **Share Flow** → Makes sharing easy
7. **Shared With You** → Completes social loop

---

## Success Criteria

### Phase 1 Success
- [ ] Users save 5+ items per week
- [ ] Daily discovery has 20%+ engagement rate
- [ ] Search intent detection 80%+ accurate
- [ ] Detail view session depth > 3 items
- [ ] Users return 3+ times per week

### Phase 2 Success
- [ ] Users have 3+ friends connected
- [ ] Share 1+ item per week to friends
- [ ] Friend shares appear in feed seamlessly
- [ ] Sharing feels natural (qualitative feedback)

### Phase 3+ Success
- [ ] Users engage with native integrations (play music, add events, etc.)
- [ ] Stash becomes default place to consume saved content
- [ ] Daily active usage

---

## Notes for AI Coding Agents

### What to Build First

When starting work, **prioritize in this order:**

1. **Daily Discovery** (`daily-discovery` function)
   - Background job to find new content
   - Generate digest
   - Add recommendations to feed

2. **Intent Detection** (`search-intent` function)
   - Classify queries (find saved, discover new, ask question)
   - Return UI directive (mini_card, stack, chat)

3. **Detail Navigation**
   - Prototype 2-3 approaches
   - Test and iterate
   - Don't lock in until it feels right

4. **You Tab Organization**
   - AI-powered smart groups
   - Filters and sorting
   - Search functionality

### What to Ask About

If you're unsure about:
- **Detail navigation approach** → Prototype multiple, ask for feedback
- **UI layout for a new feature** → Suggest 2-3 options
- **Backend function design** → Clarify requirements first
- **Priority of a feature** → Check this roadmap

### What NOT to Build Yet

Don't start on these unless explicitly asked:
- Phase 3/4 features (integrations, advanced features)
- Friend profiles with taste visualization
- Combined taste profiles
- Voice input
- Widgets/Watch app

---

## Living Document

This roadmap is updated as:
- Features are completed
- Priorities shift
- New ideas emerge
- User feedback comes in

**Last updated:** 2025-12-09
