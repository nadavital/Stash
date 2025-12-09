# Liquid Glass Implementation Guide

Technical reference for iOS 26's Liquid Glass in SwiftUI.

---

## What is Liquid Glass?

Transparent, glassy, refractive surface over content. Glass blurs content behind it, reflects surrounding color/light, and can react to touch. The content itself (images, gradients, UI) IS the background.

---

## Core API

```swift
.glassEffect()                                          // Default: .regular in .capsule
.glassEffect(in: .circle)                              // Specify shape
.glassEffect(.regular, in: .rect(cornerRadius: 16))    // Variant + shape
.glassEffect(.clear.tint(.orange).interactive())       // Tinted, interactive
```

### Variants

- **`.regular`** — Standard glass with slight tint (readable text/icons)
- **`.clear`** — Fully transparent, pure glass

### Modifiers

- **`.tint(Color)`** — Add color prominence (use instead of `.background()` on view)
- **`.interactive()`** — Glass morphs/stretches/highlights on touch

Both variants support `.tint()` and `.interactive()`.

---

## System Components (Automatic Glass)

Tab bars, navigation bars, toolbars, sheets, popovers, menus use glass automatically — no code needed.

**Don't** manually set `.foregroundStyle()` on toolbar items or system components.

---

## Usage Patterns

### Glass Over Content
```swift
// Over images - image IS the background
ZStack {
    AsyncImage(url: imageURL)
    Button("Action") { }.glassEffect(in: .circle)
}

// Over gradients
ZStack {
    LinearGradient(colors: [.purple, .blue], ...)
    Button("Action") { }.glassEffect()
}

// Over solid colors (fine)
ZStack {
    Color.blue
    Button("Action") { }.glassEffect()
}
```

### Interactive Buttons
```swift
Button("Play") { }.padding().glassEffect(.regular.interactive(), in: .capsule)
Button("Delete") { }.padding().glassEffect(.regular.tint(.red).interactive())
```

### Icon Buttons
```swift
Button { } label: {
    Image(systemName: "heart").frame(width: 44, height: 44)
}.glassEffect(in: .circle)
```

### Grouped Controls
```swift
HStack(spacing: 0) {
    Button { } label: { Image(systemName: "thumbsup").frame(width: 40, height: 36) }
    Divider().frame(height: 20)
    Button { } label: { Image(systemName: "thumbsdown").frame(width: 40, height: 36) }
}.glassEffect(in: .capsule)
```

### Badges/Pills
```swift
HStack { Text("🎵"); Text("Song") }
    .padding(.horizontal, 10).padding(.vertical, 6)
    .glassEffect()
```

### Button Styles
```swift
Button("Action") { }.buttonStyle(.glass)              // Standard glass button
Button("Primary") { }.buttonStyle(.glassProminent)    // Prominent glass button
```

---

## Synapse Lens Pattern

```swift
ZStack {
    // Particles ARE the background
    Canvas { context, size in
        for particle in particles {
            context.fill(Path(ellipseIn: rect), with: .color(particle.color))
        }
    }
    .blur(radius: 30)
    .mask(Circle())

    // Glass overlay on top
    Circle().glassEffect(.clear, in: .circle)
}
```

---

## Multiple Glass Views

Use `GlassEffectContainer` for performance and morphing:

```swift
GlassEffectContainer(spacing: 40) {
    HStack(spacing: 40) {
        view1.glassEffect()
        view2.glassEffect()
    }
}
```

**Spacing:** Controls how effects blend. Larger = sooner blending.

---

## Best Practices

### ✅ Do
- Use `.tint()` on glass for color: `.glassEffect(.regular.tint(.red))`
- Let glass handle text/icon color automatically
- Use `.interactive()` for buttons: `.glassEffect(.regular.interactive())`
- Choose `.regular` (readable) or `.clear` (transparent) based on content
- Use `GlassEffectContainer` for multiple glass views
- Be selective — not everything needs glass

### ❌ Don't
- Add `.background()` to buttons — use `.tint()` instead
- Manually set `.foregroundStyle()` on glass content
- Overuse glass everywhere
- Add `.foregroundStyle()` to toolbar items (system handles it)

---

## Common Mistakes

```swift
// ❌ Wrong: background around button
Button("Action") { }.background(.red).glassEffect()

// ✅ Correct: tint the glass
Button("Action") { }.glassEffect(.regular.tint(.red))

// ❌ Wrong: manual text color
Text("Hello").foregroundStyle(.white).glassEffect()

// ✅ Correct: let glass handle it
Text("Hello").glassEffect()
```

---

## Quick Reference

| Use Case | Code |
|----------|------|
| Basic glass | `.glassEffect()` |
| Circular glass | `.glassEffect(in: .circle)` |
| Tinted glass | `.glassEffect(.regular.tint(.orange))` |
| Interactive button | `.glassEffect(.regular.interactive())` |
| Tinted + interactive | `.glassEffect(.regular.tint(.green).interactive())` |
| Transparent glass | `.glassEffect(.clear)` |
| Glass button style | `.buttonStyle(.glass)` |
| Prominent button | `.buttonStyle(.glassProminent)` |

---

## Requirements

- iOS 26.0+
- Xcode 16+
- Swift 6.2+

---

## Summary

1. Glass is transparent — refracts content behind it
2. Use `.tint()` for color, not `.background()`
3. Glass handles text/icon color automatically
4. `.interactive()` makes glass responsive to touch
5. `.regular` (readable) or `.clear` (transparent)
6. System components use glass automatically
7. Use `GlassEffectContainer` for multiple views
8. Be selective with glass usage

See `DESIGN_GUIDE.md` for when/where to use glass in Stash.
