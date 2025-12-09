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

### 3. **Seamless Discovery Feed**
The Home tab is a continuous feed (like TikTok For You) that blends:
- Your saved items
- AI-recommended content
- Things friends shared with you

**Users shouldn't notice the difference** — it's just "content I want to see right now."

### 4. **Social Through Taste**
Friends aren't just contacts — they're **taste vectors**. The AI:
- Computes taste overlap
- Suggests what to share with whom
- Surfaces friend shares in your feed
- Makes sharing feel natural, not forced

### 5. **Prototype Fearlessly**
We're building the next big thing in AI. **Don't be afraid to:**
- Suggest new ideas
- Discard existing ideas
- Experiment and iterate
- Build, test, refine

---

## The Three Spaces

### **Home Tab** — Discovery Feed

**Purpose:** Continuous content consumption. Like TikTok For You, but for enriching content.

**What it shows:**
- Immersive cards (480pt, full-bleed backgrounds)
- Seamless blend of: your saves + AI recommendations + friend shares
- Sorted by relevance/time/context (not chronological)
- Each card has a type-specific primary action (Read, Play, Watch, etc.)

**How it's populated:**
- **Daily AI Discovery** — Background job finds new content based on taste profile
- **Your saves** — Items you've added via Share Extension or in-app
- **Friend shares** — Items friends send to your stash
- **On-demand discovery** — AI fetches more if you ask in Search tab

---

### **You Tab** — Your Archive & Friends

**Purpose:** Manage your stash, explore what you've saved (organized by AI), connect with friends.

**Sections:**
- **Your Stash** — Searchable, filterable list of all saved items (AI-organized)
- **Shared With You** — Items friends sent to your stash
- **Friends** — Connect and share with friends
- **Settings**

---

### **Search Tab** — AI Intelligence Hub

**Purpose:** Dynamic AI interface that adapts to your intent. Not just chat — the UI changes based on what you're trying to do.

**The Synapse Lens:**
- Large (200pt) liquid bioluminescent orb
- Visual anchor for all AI interactions
- States: idle, listening, thinking, answering
- Cosmic palette (deep violet #5238B5, magenta, electric blue)

**Dynamic UI Behaviors:**

**1. Finding Something You Saved**
"that pad thai recipe I saved" → Shows mini immersive card, tap to view

**2. Discovering New Content**
"find me something new to cook" → Shows stack of AI-found cards, browse and refine

**3. Asking About Current Content**
Tap "Ask Stash" in detail view → Traditional chat interface

**Daily Discovery Digest:**
- Lives in Search tab as a tappable element
- Shows what AI saved for you today and why
- Tap to explore items and refine future discovery

---

## Detail Views — Enhanced Content

### The Principle

> **Detail views ARE the content itself** — not links, not wrappers. We render the actual content (article, video, song) with Stash controls layered on top.

### Type-Specific Implementations

Different content types deserve different treatments. Each should be **engaging and content-first**.

| Type | Rendering | Primary Action |
|------|-----------|----------------|
| **Article** | WKWebView with Stash controls overlay | Read |
| **Music** | In-app player (MusicKit) | Play |
| **Video** | Embedded player (YouTube, native) | Watch |
| **Recipe** | Enhanced WebView or native view | View/Cook |
| **Restaurant** | Map + info + WebView | Get Directions |
| **Event** | Details + map | Add to Calendar |
| **Product** | WebView + price/specs | View Product |

### Standard Detail Controls

Every detail view includes:
- **Like/Dislike button** (toolbar) — Explicit taste signal, trains taste profile
- **Share button** — Send to friend's stash (one-tap, AI-ranked friends)
- **Ask Stash button** — Floating Synapse Lens (56pt, bottom-right) for context-aware chat
- **Type-specific action** — Read, Watch, Cook, etc. (contextual)

**No "Done" button** — Stash items are assets, not tasks. Engagement is tracked implicitly (opens, time spent, returns) to feed the taste profile. Users should continuously refer back to content, not "complete" it.

### Navigation Between Items (TBD — Prototype Required)

**Problem:** Avoid the "home → detail → home → detail" loop. Keep users immersed.

**Approach:** Build, test, iterate. Don't lock in until it feels delightful.

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
1. **Add friends** — By handle, contacts sync, QR code, invite link
2. **Share to stash** — One-tap send item to friend's stash
3. **Receive shares** — "Shared With You" section in You tab
4. **In-app sharing** — Custom share sheet, AI-ranked friends

**Share Flow:**
1. Tap Share button on card or detail view
2. See list of friends (AI-ranked by taste match for this item)
3. Tap friend → Item sent to their stash
4. They see it in "Shared With You" + optional push notification

### Future Social (Phase 2)

- Friend profiles with taste overlap visualization
- AI-powered share suggestions ("Sarah would love this")
- Shared history and activity
- Combined taste profiles ("What would Jake and I both like?")

---

## The Magic Moments

What makes Stash different? These are the **wow** interactions:

1. **Save a URL** → AI instantly enriches it (summary, tags, insights appear in seconds)
2. **Open Home feed** → See content you forgot you saved, perfectly timed (restaurant you saved weeks ago, now surfaced because you're nearby)
3. **Ask AI "what should I cook tonight?"** → Get personalized recipe suggestions from your stash
4. **Share with friends** → Tap Share, see friends ranked by who would actually like it
5. **Daily Digest** → AI explains what it discovered for you and why
6. **Detail view navigation** → Seamlessly flow from one piece of content to the next (whatever we build here must feel delightful)

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
