import Foundation

/// Represents the state of horizontal navigation transitions in detail view
enum HorizontalTransitionState: Equatable {
    case stable
    case fadingOut(direction: NavigationDirection)
    case fadingIn(from: NavigationDirection)

    enum NavigationDirection {
        case previous
        case next
    }

    /// Opacity for content during transition (0.0 to 1.0)
    var contentOpacity: CGFloat {
        switch self {
        case .stable: return 1.0
        case .fadingOut: return 0.0
        case .fadingIn: return 1.0
        }
    }

    /// Scale for content during transition
    var contentScale: CGFloat {
        switch self {
        case .stable: return 1.0
        case .fadingOut: return 0.95
        case .fadingIn(from: .next): return 1.05  // Enter from right (next item)
        case .fadingIn(from: .previous): return 1.05  // Enter from left (previous item)
        }
    }

    /// Blur radius during transition
    var blurRadius: CGFloat {
        switch self {
        case .stable: return 0
        case .fadingOut: return 8
        case .fadingIn: return 0
        }
    }
}
