# Common Issues & Fixes

Quick reference for known issues and their solutions.

---

## Card Jitter During Navigation

**Issue:** Card briefly shifts/jitters when swiping between cards, even with proper animation isolation.

**Cause:** Missing `.id()` modifier causes SwiftUI to update card content before offset resets, showing new data at old position briefly.

**Fix:** Add `.id("card-\(currentIndex)")` to force view recreation:

```swift
MorphingCard(...)
    .animation(.none, value: currentIndex)
    // ... other modifiers ...
    .id("card-\(currentIndex)")  // ⚠️ CRITICAL
    .zIndex(100)
```

⚠️ **Critical:** Do not remove this modifier - it's essential for smooth navigation.

---
