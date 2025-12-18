import SwiftUI

/// A card that morphs between full-screen deck state and compact header state
/// Uses pure geometric transitions - no matchedGeometry conflicts
struct MorphingCard<Background: View>: View {
    let emoji: String
    let title: String
    let source: String
    let background: Background

    var body: some View {
        GeometryReader { geometry in
            let currentHeight = geometry.size.height
            let screenHeight = UIScreen.main.bounds.height
            let collapsedHeight: CGFloat = 120

            // Calculate progress (0.0 = Full Screen, 1.0 = Header Mode)
            let expansionRange = max(screenHeight - collapsedHeight, 1)
            let rawProgress = (screenHeight - currentHeight) / expansionRange
            let progress = max(0, min(1, rawProgress))

            // Interpolated layout values
            let emojiSize = 42.0 - (progress * 18.0)       // 42 → 24
            let titleSize = 32.0 - (progress * 16.0)       // 32 → 16
            let cornerRadius = 16.0 - (progress * 16.0)    // 16 → 0 (subtle rounding)
            let horizontalPadding = 24.0 - (progress * 4.0) // 24 → 20

            // Position interpolation
            let emojiTopPadding = 60.0 - (progress * 46.0) // 60 → 14
            let titleBottomPadding = 100.0 - (progress * 86.0) // 100 → 14

            ZStack(alignment: .topLeading) {
                // BACKGROUND
                background
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
                    .shadow(color: .black.opacity(0.2 * (1.0 - progress)), radius: 10, y: 5)

                // CONTENT
                ZStack(alignment: .topLeading) {
                    // Top Row: Emoji & Source Label (visible when collapsed)
                    HStack(alignment: .center) {
                        Text(emoji)
                            .font(.system(size: emojiSize))

                        // Fade in Source Label when becoming a header
                        if progress > 0.5 {
                            Spacer()
                            Text(source.uppercased())
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white.opacity(0.7))
                                .opacity((progress - 0.5) * 2.0)
                        }
                    }
                    .padding(.top, emojiTopPadding)
                    .padding(.horizontal, horizontalPadding)

                    // Bottom Row: Title & Source Label (visible when expanded)
                    VStack(alignment: .leading, spacing: 4) {
                        Spacer()

                        VStack(alignment: .leading, spacing: 4) {
                            Text(title)
                                .font(.system(size: titleSize, weight: .bold))
                                .foregroundStyle(.white)
                                .lineLimit(progress > 0.8 ? 1 : 3)

                            // Fade out Source Label when shrinking
                            if progress < 0.5 {
                                Text(source.uppercased())
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.6))
                                    .opacity(1.0 - (progress * 2.0))
                            }
                        }
                        .padding(.bottom, titleBottomPadding)
                        .padding(.horizontal, horizontalPadding)
                    }
                }
                .padding(.top, geometry.safeAreaInsets.top)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }
}
