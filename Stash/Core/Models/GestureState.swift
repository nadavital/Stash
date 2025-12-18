import SwiftUI

/// Gesture direction detection to prevent conflicts between vertical and horizontal gestures
enum GestureDirection: Equatable {
    case vertical(up: Bool)
    case horizontal(left: Bool)
    case none

    /// Detects gesture direction from translation, prioritizing the dominant axis
    /// - Parameters:
    ///   - translation: Drag gesture translation
    ///   - threshold: Minimum movement to detect direction (default 10pt)
    /// - Returns: Detected direction with specifics (up/down, left/right)
    static func detect(translation: CGSize, threshold: CGFloat = 10) -> GestureDirection {
        let vertical = abs(translation.height)
        let horizontal = abs(translation.width)

        // Add hysteresis to prevent diagonal flip-flopping
        // Vertical wins if it's clearly dominant (1.2x multiplier)
        if vertical > horizontal * 1.2 && vertical > threshold {
            return .vertical(up: translation.height < 0)
        } else if horizontal > vertical * 1.2 && horizontal > threshold {
            return .horizontal(left: translation.width < 0)
        }
        return .none
    }

    /// Check if gesture is vertical (up or down)
    var isVertical: Bool {
        if case .vertical = self { return true }
        return false
    }

    /// Check if gesture is horizontal (left or right)
    var isHorizontal: Bool {
        if case .horizontal = self { return true }
        return false
    }
}
