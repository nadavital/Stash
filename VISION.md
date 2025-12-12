# Stash Vision

> **A discovery engine for everything you want to know** — Save anything, and let AI surface it exactly when you need it.

---

## What is Stash?

Stash is a **discovery engine** that learns your taste and surfaces content that enriches and delights you. It's not a bookmark manager or read-it-later app — it's an AI-powered feed of things you've saved mixed seamlessly with things the AI thinks you should see.

**The Magic:**
- Save anything from anywhere (Share Extension)
- AI instantly enriches it (summary, tags, insights, type detection)
- Content appears in your Home feed when it's relevant
- AI discovers new content for you daily
- Share with friends in one tap (AI knows who would like what)

**The Goal:** Make Stash the place you **actually engage** with saved content — not a graveyard of forgotten links, but an active discovery feed powered by AI that learns your taste.

---

## Core Principles

### 1. **Beyond Chat**
The AI is not just a chatbot. It's an **ambient intelligence** that:
- Enhances everything you save (enrichment)
- Knows your intent (searching vs. discovering)
- Adapts the interface dynamically
- Proactively fetches content (daily + on-demand)
- Surfaces information exactly when you need it

### 2. **Content First, Always**
- **Cards = Peek** — Immersive previews with AI-generated insights
- **Detail Views = Enhanced Content** — Not wrappers or links, but the actual content itself with Stash controls layered on top
- Keep users in-app (articles, videos, music all playable/viewable inside Stash)

### 3. **Seamless Discovery Deck**
The Home deck is a continuous flow (like flipping through cards) that blends:
- Your saved items
- AI-recommended content (with "Picked for you" attribution)
- Things friends shared with you (with glass pill "from [friend]")

**Users shouldn't notice the difference** — it's just "content I want to see right now."

### 4. **Social Through Taste & Conversation**
Friends aren't just contacts — they're **taste vectors and conversation partners**. The AI:
- Computes taste overlap
- Suggests what to share with whom
- Surfaces friend shares in your deck (with glass pill attribution)
- Makes friendships living conversations (items + reactions + AI insights)
- Can participate in group chats (future)

### 5. **Prototype Fearlessly**
We're building the next big thing in AI. **Don't be afraid to:**
- Suggest new ideas
- Discard existing ideas
- Experiment and iterate
- Build, test, refine

---

## The Core Experience

### **Home — The Deck**

**Interaction Model:**
- Think of your stash as a **deck of full-screen cards** you flip through
- Swipe **left/right** to move between items (with fluid 3D card-flip animation)
- Swipe **up** to dive into detail view (content slides up modally)
- Swipe **left/right in detail** to move between items without returning to deck
- Swipe **down** to dismiss back to deck

**What's in the deck:**
- Your saved items
- AI recommendations (daily discoveries with "Picked for you" attribution)
- Friend shares (with glass pill "from [friend]" overlay)
- All blended seamlessly — one continuous flow

**Card Design (Full-Screen):**
- Cards fill entire screen (immersive, one thing at a time)
- Full-bleed background (image or gradient)
- Minimal overlay UI:
  - Top: Type pill + share button (glass)
  - Bottom: Title, summary, friend/AI attribution, action buttons (glass)
- Floating AI orb (bottom-right, always accessible)
- Floating + button (bottom-left, add new items)

**How it's populated:**
- **Daily AI Discovery** — Background job finds content, adds to deck with "Picked for you"
- **Your saves** — Items from Share Extension or in-app
- **Friend shares** — Items friends send to your stash (appear with "from [friend]" pill)
- **On-demand discovery** — AI can add more via Chat conversations

---

### **Chat — AI Conversations**

**Purpose:** Your conversation history with Stash AI. Not just search, but ongoing dialogue.

**Features:**
- Conversation threads organized by topic/query
- Large Synapse Lens (200pt) in empty state
- AI can reference items from your stash
- AI suggests friends to share with ("Sarah would love this")
- Quick friend adding via [+] button in toolbar

**Chat replaces traditional search** — AI understands intent and adapts responses.

---

### **Friends — Contextual, Not a Tab**

**Philosophy:** Real taste connections, not social media followers.

**How Friends Appear:**
- **In Home deck:** Friend shares show glass pill "from Sarah" (tappable for quick reply)
- **In Chat:** AI suggests who to share with based on taste overlap
- **In Profile:** Manage friends, see taste similarity, shared history

**How to Add Friends:**
1. **Through sharing** (primary) — Share item → see "Add friends" prompt → organic discovery
2. **Scan code** (like Snapchat) — Profile → Your Code → Friend scans → instant add
3. **Search handle** — Chat [+] or Profile → Search @username
4. **Contacts sync** — Find friends already using Stash
5. **Invite link** — Send to friends not on Stash yet

**Friend Interaction:**
- Mutual connections (not follow/follower)
- AI-ranked by taste match when sharing
- Private by default (your stash is yours)
- Sharing is conversation, not broadcast

---

### **Profile — Your Stash & Settings**

**Access:** Tap profile icon (top-right in Home toolbar)

**Profile Sheet Contents:**
- Your handle + avatar
- **Your Code** — Scannable code for instant friend adds (like Snapchat)
- **Your Stash** (1,247 items) → Full searchable/filterable list
- **Friends** (12) → Manage friends, see taste overlap
- **Settings** → Account, preferences, sign out

---

## Detail Views — Enhanced Content

### The Principle

> **Detail views ARE the content itself** — not links, not wrappers. We render the actual content (article, video, song) with Stash controls layered on top.

### Type-Specific Implementations

Different content types deserve different treatments. Each should be **engaging and content-first**.

| Type | Rendering | Primary Action |
|------|-----------|----------------|
| **Article** | WKWebView with floating glass overlay | Read |
| **Music** | In-app player (MusicKit) or mini-player from card | Play |
| **Video** | Embedded player (YouTube, native) | Watch |
| **Recipe** | Enhanced WebView or native view | View/Cook |
| **Restaurant** | Map + info + WebView | Get Directions |
| **Event** | Details + map | Add to Calendar |
| **Product** | WebView + price/specs | View Product |

### Floating Glass Controls

**Core actions (always visible):**
- **Like/Unlike** — Explicit taste signal
- **Send to friend's stash** — One-tap, AI-ranked friends
- **Ask Stash** — Double-tap anywhere or tap floating Synapse Lens (56pt, bottom-right)
- **Delete** — Buried but accessible

**Proactive AI prompts:**
- For certain content types, suggested questions appear as glass chips
- Example: Recipes → "What can I substitute for X?"
- Example: Articles → "Summarize in one sentence"

**Primary actions:**
- Some content doesn't require entering detail view (music can play from card)
- Cards make primary action obvious (big glass Play button for music)

**No "Done" button** — Stash items are assets, not tasks. Engagement is tracked implicitly (opens, time spent, returns) to feed the taste profile. Users should continuously refer back to content, not "complete" it.

### Navigation Between Items

**Gesture-based flow:**
- Swipe **left/right in detail view** to move to next/previous item
- Continuous flow — no "detail → deck → detail" loop
- Swipe **down** to dismiss back to deck

---

## AI Capabilities

### 1. Content Enrichment (On Save)
When you save any URL, the AI immediately:
- Detects type (article, song, recipe, event, etc.)
- Generates summary (2-3 sentences)
- Extracts metadata (read time, cook time, artist, etc.)
- Creates tags and vibe descriptors
- Suggests prompts for "Ask Stash"
- Generates embedding for search

### 2. Daily Discovery (Background)
Once per day (configurable), the AI:
- Analyzes your taste profile
- Scours the web for new content matching your interests
- Finds content from high-similarity friends
- Adds items to your Home feed
- Creates a digest explaining top picks

### 3. Intent-Aware Search
The AI knows when you're:
- **Finding something specific** → Returns item card
- **Discovering new content** → Returns stack of suggestions
- **Asking a question** → Returns conversational answer

**No mode switching** — AI detects intent and adapts UI automatically.

### 4. Social Intelligence
The AI:
- Computes taste overlap with friends (embeddings)
- Ranks friends by who would like each item
- Suggests items to share with specific friends (future)

---

## Social Features

### MVP Social (Phase 1)

**Core functionality:**
1. **Add friends** — Multiple organic methods:
   - **Scan code** (primary) — Profile → Your Code → scan like Snapchat
   - Search by @handle
   - Contacts sync
   - Invite link for non-users
2. **Share to stash** — One-tap send item to friend's deck (floating glass control)
3. **Receive shares** — Friend shares appear in deck with glass pill "from [friend]"
4. **Quick reply** — Tap friend attribution pill → voice note, text, or emoji
5. **AI-ranked sharing** — Custom share sheet with friends sorted by taste match

**Share Flow:**
1. Tap Share button (floating glass control in detail view)
2. Custom share sheet appears:
   - **No friends yet:** "Add friends to share instantly" card with [Add Friend] button
   - **Have friends:** AI-ranked list by taste match for this item
3. Tap friend → Item sent to their deck
4. They see it with "from [you]" glass pill + optional push notification
5. They tap pill → Quick reply or profile view

**Friend Adding Flow:**
1. **Scan Code (Primary):**
   - Home → Profile icon → Your Code
   - Shows scannable code (like Snapchat's Snapcode)
   - Tap "Scan Friend's Code" → Camera opens
   - Scan → Instant add (mutual, no approval needed for in-person)
2. **Search Handle:**
   - Chat [+] or Profile → Friends → [+ Add]
   - Search @username
   - Send request → They approve
3. **Contacts/Invite:**
   - Find existing Stash users from contacts
   - Generate invite link for non-users

### Future Social (Phase 2)

- **Friendship conversations** — Each friendship = thread of items + reactions + AI insights
- **Group chats with AI** — AI as participant in group conversations
- **AI proactive suggestions** — "You both saved 3 recipes this week—want to plan dinner?"
- **Taste-based recommendations** — "Sarah would love this" (appears in Chat)
- Combined taste profiles ("What would Jake and I both like?")

---

## The Magic Moments

What makes Stash different? These are the **wow** interactions:

1. **Save a URL** → AI instantly enriches it (summary, tags, insights appear in seconds)
2. **Open the deck** → Flip through your stash like cards, with fluid animations
3. **Swipe up** → Dive into content, swipe left/right to move between items without leaving
4. **Friend sends you something** → Appears in your deck with glass pill "from Sarah"—tap to quick reply
5. **Double-tap in detail** → Ask AI about what you're looking at, get instant context
6. **Proactive AI prompts** → For certain content, suggested questions appear without asking
7. **Daily AI discoveries** → New items appear in your deck with "Picked for you" attribution
8. **Share with friends** → Tap Share, see friends ranked by who would actually like it

---

## Success Metrics

Stash succeeds when users:

1. **Save frequently** — Share Extension feels effortless, in-app add is natural
2. **Engage deeply** — Spend time with content (read articles, watch videos, listen to music)
3. **Return often** — Re-engage with saved items (high-value items get multiple visits)
4. **Trust the AI** — Accept recommendations, let AI organize, use daily discovery
5. **Stay in flow** — Navigate between items without returning to lists
6. **Share naturally** — Sending to friends feels easy and intentional
7. **Check daily** — Open Home feed like social media (but enriching, not draining)

**Engagement Philosophy:** Time spent and return visits are better signals than checkboxes. An article you re-read is more valuable than one you "completed."

---

## Design Principles

1. **Beyond Chat** — AI is ambient, proactive, interface-adaptive (not just a chatbot)
2. **Content First** — Detail views are enhanced content, not wrappers
3. **Seamless Discovery** — Home feed blends saves + AI recs + friend shares invisibly
4. **Prototype Fearlessly** — Build, test, discard, iterate without hesitation
5. **Delight in Details** — Micro-interactions should feel magical
6. **Keep Users In-App** — Render content natively (articles, videos, music)
7. **Smart Defaults** — AI organizes, sorts, recommends (users don't manage)
8. **Personal First** — Individual experience must be great before scaling social

---

## The North Star

> **We're building the next big thing in AI.**

Stash should feel like:
- **TikTok For You** — But enriching, not draining
- **Notion AI** — But proactive, not reactive
- **Pinterest** — But personalized by real intelligence
- **Apple Music** — But for all content, not just music

It's a **discovery engine** that learns your taste and surfaces content exactly when you need it. Save anything, discover everything.

**Let's build something people use every day.**
