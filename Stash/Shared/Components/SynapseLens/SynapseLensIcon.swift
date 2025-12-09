import SwiftUI

/// Static SVG version of the Synapse Lens for small contexts
/// Uses pre-rendered SVG for better performance in icons/thumbnails
public struct SynapseLensIcon: View {
    let size: CGFloat

    public init(size: CGFloat) {
        self.size = size
    }

    public var body: some View {
        Image("synapse-lens-static")
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
    }
}

/// Smart wrapper that chooses between animated and static lens based on size
public struct AdaptiveSynapseLens: View {
    let size: CGFloat
    let state: SynapseLensState
    let palette: LensColorPalette

    // Use static SVG for small sizes (< 50pt) for better performance
    private let animationThreshold: CGFloat = 50

    public init(size: CGFloat, state: SynapseLensState = .idle, palette: LensColorPalette = .cosmic) {
        self.size = size
        self.state = state
        self.palette = palette
    }

    public var body: some View {
        if size < animationThreshold {
            SynapseLensIcon(size: size)
        } else {
            SynapseLensView(size: size, state: state, palette: palette)
        }
    }
}
