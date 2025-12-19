import SwiftUI

/// Minimal theme for brand colors and animation constants
/// All other styling uses native SwiftUI (`.primary`, `.secondary`, etc.)
struct StashTheme {
    struct Color {
        // Brand accent (Stash actions) - uses AccentColor from assets
        static var accent: SwiftUI.Color {
            SwiftUI.Color("AccentColor", bundle: nil)
        }

        // AI identity (cosmic violet/blue) - matches Synapse Lens
        static let ai = SwiftUI.Color(hex: "#5238B5")              // Deep Violet = intelligence
        static let aiSoft = SwiftUI.Color(hex: "#5238B5").opacity(0.14)
        static let aiGlow = SwiftUI.Color(hex: "#5238B5").opacity(0.45)

        // Semantic - same in both modes
        static let success = SwiftUI.Color(hex: "#22C55E")
        static let warning = SwiftUI.Color(hex: "#FACC15")
        static let danger = SwiftUI.Color(hex: "#F97373")
    }

    struct Gesture {
        // Interactive spring - used during live gesture dragging
        static let interactiveSpring = Animation.spring(response: 0.25, dampingFraction: 0.85)

        // Completion spring - used when gesture completes successfully
        static let completionSpring = Animation.spring(response: 0.35, dampingFraction: 0.82)

        // Cancel spring - used when gesture cancels/snaps back
        static let cancelSpring = Animation.spring(response: 0.3, dampingFraction: 0.8)

        // Completion delay - standard delay before transitioning modes after gesture animation
        static let completionDelay: TimeInterval = 0.25

        // Card rotation angle for horizontal swipes (degrees)
        static let rotationAngle: Double = 10.0

        // Horizontal swipe threshold as proportion of screen width
        static let horizontalSwipeThreshold: CGFloat = 0.25

        // Detail transition delay - for Task.sleep after animations
        static let detailTransitionDelay: Double = 0.25
    }
}

// MARK: - Color+Hex Helper

extension SwiftUI.Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
