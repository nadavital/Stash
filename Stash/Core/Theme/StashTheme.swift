import SwiftUI

struct StashTheme {
    struct Color {
        // Backgrounds - adaptive for dark/light mode
        static var bg: SwiftUI.Color {
            SwiftUI.Color("StashBackground", bundle: nil)
        }
        static var surface: SwiftUI.Color {
            SwiftUI.Color("StashSurface", bundle: nil)
        }
        static var surfaceSoft: SwiftUI.Color {
            SwiftUI.Color("StashSurfaceSoft", bundle: nil)
        }
        static var surfaceElevated: SwiftUI.Color {
            SwiftUI.Color("StashSurfaceElevated", bundle: nil)
        }

        // Borders & dividers - adaptive
        static var borderSubtle: SwiftUI.Color {
            SwiftUI.Color("StashBorderSubtle", bundle: nil)
        }
        static var borderStrong: SwiftUI.Color {
            SwiftUI.Color("StashBorderStrong", bundle: nil)
        }

        // Text - adaptive
        static var textPrimary: SwiftUI.Color {
            SwiftUI.Color("StashTextPrimary", bundle: nil)
        }
        static var textSecondary: SwiftUI.Color {
            SwiftUI.Color("StashTextSecondary", bundle: nil)
        }
        static var textMuted: SwiftUI.Color {
            SwiftUI.Color("StashTextMuted", bundle: nil)
        }

        // Brand accent (Stash actions) - uses AccentColor from assets
        static var accent: SwiftUI.Color {
            SwiftUI.Color("AccentColor", bundle: nil)
        }
        static var accentSoft: SwiftUI.Color {
            SwiftUI.Color("AccentColor", bundle: nil).opacity(0.14)
        }
        static var accentStrong: SwiftUI.Color {
            SwiftUI.Color("AccentColor", bundle: nil).opacity(0.8)
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

    struct Radius {
        static let card: CGFloat = 16
        static let sheet: CGFloat = 24
        static let button: CGFloat = 999  // Fully rounded
        static let pill: CGFloat = 999
        static let tile: CGFloat = 12
    }

    struct Shadow {
        // Adaptive shadows - darker in dark mode, lighter in light mode
        static var soft: (color: SwiftUI.Color, radius: CGFloat, x: CGFloat, y: CGFloat) {
            (SwiftUI.Color.black.opacity(0.15), 12, 0, 4)
        }
        static var subtle: (color: SwiftUI.Color, radius: CGFloat, x: CGFloat, y: CGFloat) {
            (SwiftUI.Color.black.opacity(0.08), 2, 0, 1)
        }
    }

    struct Motion {
        static let fast: Double = 0.15      // 150ms
        static let medium: Double = 0.22    // 220ms
        static let slow: Double = 0.32      // 320ms
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
