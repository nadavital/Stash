import Foundation
import UIKit

/// Represents the state of horizontal navigation transitions in detail view
enum HorizontalTransitionState: Equatable {
    case stable
    case fadingOut(direction: NavigationDirection)
    case fadingIn(from: NavigationDirection)

    enum NavigationDirection {
        case previous
        case next
    }

    /// Horizontal offset for card during transition
    var cardOffset: CGFloat {
        let screenWidth = UIScreen.main.bounds.width
        switch self {
        case .stable: return 0
        case .fadingOut(direction: .next): return -screenWidth  // Slide left
        case .fadingOut(direction: .previous): return screenWidth  // Slide right
        case .fadingIn(from: .next): return screenWidth  // Enter from right
        case .fadingIn(from: .previous): return -screenWidth  // Enter from left
        }
    }

    /// Opacity for scrollable content during transition (crossfade)
    var contentOpacity: CGFloat {
        switch self {
        case .stable: return 1.0
        case .fadingOut: return 0.0
        case .fadingIn: return 1.0
        }
    }

    /// Blur radius for content during transition
    var blurRadius: CGFloat {
        switch self {
        case .stable: return 0
        case .fadingOut: return 8
        case .fadingIn: return 0
        }
    }
}
