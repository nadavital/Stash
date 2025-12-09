# Stash Design Guide

Visual style and aesthetic guidelines for the Stash app.

---

## Design Philosophy

1. **Joy over utility** — Every interaction delightful
2. **Calm over busy** — One thing at a time, no visual overwhelm
3. **Smart over manual** — AI handles organization, users just save
4. **Content over chrome** — Detail views are content, not wrappers

---

## Liquid Glass Aesthetic

Stash embraces iOS 26's **Liquid Glass** throughout:

- **Depth through translucency** — Glass blurs and refracts content behind it
- **Tactile surfaces** — Glass creates refraction, depth, and responds to touch
- **Floating elements** — Controls hover above content with glass
- **Breathing room** — Generous spacing, never cramped

**Visual goal:** Looking through layers of liquid glass at your content.

---

## When to Use Glass

### ✅ Use Glass For

**Interactive controls over content:**
- Icon buttons (share, like, actions) on cards
- Grouped button controls (like/dislike together)
- Type badges and pills on cards
- Floating action buttons (Ask Stash)
- Primary action buttons (Read, Watch, Cook)

**Primary actions use tinted glass:**
- Tint glass buttons for contextual prominence
- Examples: Green for confirm, red for delete, orange for primary CTAs
- Seen on immersive card CTAs (Read, Watch, Cook buttons)

**Where glass appears:**
- Over images (immersive cards)
- Over gradients (backgrounds)
- Over solid colors (acceptable)
- Floating over rich content

### ❌ Don't Use Glass For

- Large content areas (use regular surfaces)
- Static text (no interactivity)
- Every single element (visual noise)
- Main app backgrounds

**Principle:** Glass highlights interactive elements and floats above content. Be selective.

---

## Color System

### Cosmic Palette (Primary)

Deep purples and magentas for AI identity:

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Violet | `#5238B5` | Synapse Lens, AI elements |
| Magenta | `#943885` | Secondary accent |
| Electric Blue | `#386BB8` | Tertiary accent |
| Purple | `#6B52AD` | Midtones |

**Where cosmic appears:**
- Synapse Lens (soul of the app)
- AI-related UI (Ask Stash, chat)
- Tinted glass buttons (primary actions)
- Gradient accents on cards

### Adaptive Color Roles

Via `StashTheme.Color` (adapt to dark/light mode):

**Backgrounds:** `bg`, `surface`, `surfaceSoft`, `surfaceElevated`
**Text:** `textPrimary`, `textSecondary`, `textMuted`
**Brand:** `accent` (purple), `ai` (deep violet #5238B5)
**Semantic:** `success`, `warning`, `danger`

---

## Typography

### Type Scale

**StashTypography:**
- `pageTitle` — 30pt bold (screen titles)
- `sectionTitle` — 21pt semibold (section headers)
- `cardTitle` — 17pt semibold (card titles)
- `body` — 15pt regular (body text)
- `meta` — 12pt regular (metadata)
- `caption` — 11pt regular (small text)

**Or use system aliases:** `largeTitle`, `title`, `headline`, `body`, `caption`

### Guidelines

- Respect Dynamic Type when possible
- Use semantic weights (`.bold()` not `.fontWeight(.bold)`)
- Generous line spacing

---

## Spacing & Layout

### Spacing Scale

**Standard:** `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`, `xxl: 32`

**Domain-specific (StashSpacing):**
- `screenHorizontal: 18` — Screen edges
- `sectionVertical: 20` — Between sections
- `related: 6` — Tight grouping
- `cardPadding: 14` — Inside cards

### Layout Principles

- Breathing room (never cramped)
- Consistent margins
- Related items closer, unrelated farther
- Respect safe areas

---

## Shapes & Radius

**Standard radii (StashTheme.Radius):**

| Element | Radius | Usage |
|---------|--------|-------|
| `card` | 16pt | Cards, panels |
| `sheet` | 24pt | Sheets, modals |
| `button` | 999pt | Capsule (fully rounded) |
| `pill` | 999pt | Tags, badges |
| `tile` | 12pt | Small chips |

**Guidelines:**
- Continuous curves (`.continuous` style)
- Consistent radii (don't mix arbitrarily)
- Fully rounded for interactive (buttons, pills)
- Moderate for containers (cards 16pt, sheets 24pt)

---

## Shadows & Elevation

**Shadows (StashTheme.Shadow):**
- `soft` — Subtle elevation (floating elements)
- `subtle` — Very light (cards)

**Guidelines:**
- Use sparingly (glass provides depth)
- Consistent elevation for same element type
- Adaptive opacity (dark/light mode)
- Prefer glass over heavy shadows

---

## The Synapse Lens

The **soul of Stash** — liquid bioluminescent orb representing the AI companion.

**Visual Identity:**
- Liquid particle system with metaball blur
- Glass overlay for depth and refraction
- Cosmic palette (deep violet, magenta, electric blue)
- Continuous breathing animation

**States:**
- **Idle** — Gentle breathing, calm
- **Listening** — Deep expansion (future: voice)
- **Thinking** — Fast breathing, high energy
- **Answering** — Steady flow

**Sizes:**
- 200pt — Search screen (hero, prominent)
- 56pt — Floating Ask Stash button
- 32-48pt — Inline indicators, conversation
- 28pt — Compact chat avatars

**Where it appears:**
- Search tab (large, prominent)
- Item detail (floating button)
- Chat interface (conversation avatar)
- Tab bar accessor (future)
- Anywhere AI interaction happens

**Guidelines:**
- Always animate (never static)
- Consistent cosmic palette
- Hero sizes for empty states, compact for inline
- Always includes glass overlay

---

## Card Design

### Immersive Cards (Home Feed)

**Dimensions:** 480pt height, 24pt corner radius, 20pt horizontal padding

**Visual features:**
- Full-bleed background (image or type-specific gradient)
- Gradient overlay for readability (clear → black, bottom-heavy)
- Glass controls float on top
- **Primary CTA uses tinted interactive glass** (Read, Watch, Cook buttons)

**Glass usage on cards:**
- Type badge, share button, like/dislike grouped buttons, Ask Stash button
- Primary action (tinted interactive glass) — contextual color

---

## Gradients

**Type-specific gradients** when no image:
- Article: Navy → dark blue
- Recipe: Amber → brown
- Song: Purple → dark purple
- Event: Teal → dark teal
- Video: Red → dark red

**Pattern:** Diagonal gradient + subtle glow + emoji watermark (6% opacity)

**Readability overlays:** Clear at top → black at bottom (bottom-heavy)

---

## Motion & Animation

**Timing:** Fast (0.15s), medium (0.22s), slow (0.32s) — via `StashTheme.Motion`

**Types:** Spring (natural) or ease curves (polished)

**Animate:** Button presses (scale 97-98%), state changes, Synapse Lens states, sheets, list changes

**Don't animate:** Initial layout, static content, pure data updates

---

## Iconography

**SF Symbols:** Medium or Semibold weight, adaptive color via StashTheme.Color

**Stash Glyph:** Custom brand icon (two circles), 20-64pt, adaptive colors

---

## Interaction Patterns

**Haptics:** Light (subtle), medium (standard), success (confirmations), error

**Button States:**
- Glass: Refraction + 0.97x scale on press, interactive glass morphs/highlights
- Standard: Full opacity, 0.97x scale on press, 0.5 opacity disabled

**Loading:** Synapse Lens "thinking" state, avoid skeletons, use `.progressView()` sparingly

---

## Accessibility

WCAG AA contrast, accessibility labels on icons, support Dynamic Type, test with VoiceOver

---

## Do's and Don'ts

### ✅ Do

- Use glass for interactive elements over content
- Use tinted glass for primary actions (contextual color)
- Keep generous spacing and breathing room
- Use cosmic colors for AI-related UI
- Animate state changes smoothly
- Make text legible on all backgrounds
- Be selective with glass (not everything needs it)

### ❌ Don't

- Overuse glass (creates visual noise)
- Use arbitrary colors (stick to StashTheme)
- Mix corner radii inconsistently
- Create jarring animations
- Force small text sizes
- Use heavy shadows (glass provides depth)
- Ignore dark mode adaptation

---

## Visual Hierarchy

**Primary:** Card title, CTA buttons, Synapse Lens
**Secondary:** Summary text, metadata, type badges
**Tertiary:** Source labels, timestamps

Larger/bolder = more important. Brand purple/AI violet = high importance.

---

## Glass Usage Summary

**Interactive controls:** Icon buttons, grouped controls, badges, floating buttons
**Primary actions:** Tinted glass buttons (contextual color prominence)
**Over content:** Images, gradients, solid colors
**System elements:** Tab bars, toolbars, sheets (automatic)

**Key principle:** Glass highlights interactive elements and floats above content. Tint glass for contextual prominence (primary actions, confirmations, destructive actions).

For technical implementation, see `LIQUID_GLASS.md`.

---

## Platform Integration

Standard iOS conventions: Tab bar at bottom, standard navigation bars, sheets, context menus

---

## Summary

**Design essence:**
- Liquid Glass everywhere (translucent, tactile, modern)
- Cosmic AI identity (deep purples and magentas)
- Calm over busy (spacious, breathable, focused)
- Content first (chrome supports, never overwhelms)
- Synapse Lens as soul (living AI companion)
- Tinted glass for primary actions (contextual prominence)
