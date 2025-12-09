import SwiftUI

/// The focus states of the Synapse Lens
public enum SynapseLensState: Equatable, Hashable {
    /// Gentle breathing - calm focus
    case idle

    /// Deep breath - receptive, taking in input
    case listening

    /// Fast breathing - active processing, analyzing
    case thinking

    /// Steady flow - delivering response
    case answering

    // MARK: - Physics Parameters

    var speedMultiplier: CGFloat {
        switch self {
        case .idle: return 0.5
        case .listening: return 0.2  // Slow down to focus
        case .thinking: return 3.0   // High turmoil
        case .answering: return 1.2  // Moderate flow
        }
    }

    func blurAmount(forSize size: CGFloat) -> CGFloat {
        let referenceSize: CGFloat = 120
        let baseBlur: CGFloat

        switch self {
        case .idle: baseBlur = 10     // Reduced for glass compensation
        case .listening: baseBlur = 4 // Sharper/Defined
        case .thinking: baseBlur = 15 // Motion blur
        case .answering: baseBlur = 8 // Slight motion
        }

        let scaledBlur = baseBlur * (size / referenceSize)
        return max(2.0, scaledBlur) // Clamp minimum
    }

    func particleCount(forSize size: CGFloat) -> Int {
        let baseCount: Int

        switch self {
        case .idle: baseCount = 50
        case .listening: baseCount = 65
        case .thinking: baseCount = 80
        case .answering: baseCount = 60
        }

        // Small size optimization
        if size < 50 {
            return max(4, Int(Double(baseCount) * 0.15))
        }

        return baseCount
    }

    func particleSizeRange(forSize size: CGFloat) -> ClosedRange<CGFloat> {
        if size < 50 {
            // Tiny lava lamp - bigger blobs relative to container
            return (size * 0.25)...(size * 0.40)
        } else {
            // Standard size - original proportions
            return (size * 0.06)...(size * 0.14)
        }
    }

    var breathingAmplitude: CGFloat {
        switch self {
        case .idle: return 0.03      // Gentle breathing
        case .listening: return 0.08 // Deep expansion (listening)
        case .thinking: return 0.06  // Rapid shallow breathing
        case .answering: return 0.05 // Steady flow
        }
    }

    var breathingSpeed: CGFloat {
        switch self {
        case .idle: return 2.0      // Slow and calm
        case .listening: return 3.0 // Slower, deeper breaths
        case .thinking: return 1.0  // Fast, anxious breathing
        case .answering: return 1.8 // Moderate steady pace
        }
    }
}
