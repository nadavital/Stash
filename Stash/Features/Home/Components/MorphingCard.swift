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
            // Height = safe area (behind Dynamic Island) + fixed content height (visible area)
            let collapsedHeight: CGFloat = geometry.safeAreaInsets.top + 60

            // Calculate progress (0.0 = Full Screen, 1.0 = Header Mode)
            let expansionRange = max(screenHeight - collapsedHeight, 1)
            let rawProgress = (screenHeight - currentHeight) / expansionRange
            let progress = max(0, min(1, rawProgress))

            // Interpolated layout values
            let emojiSize = 42.0 - (progress * 14.0)       // 42 → 28
            let titleSize = 32.0 - (progress * 14.0)       // 32 → 18
            let cornerRadius = 16.0 - (progress * 4.0)     // 16 → 12
            let horizontalPadding = 24.0 - (progress * 8.0) // 24 → 16

            // Position interpolation
            let emojiTopPadding = 60.0 - (progress * 44.0) // 60 → 16
            let titleBottomPadding = 140.0 - (progress * 126.0) // 140 → 14

            ZStack(alignment: .topLeading) {
                // BACKGROUND (ignores safe area, fills entire frame)
                background
                    .ignoresSafeArea()
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
                    .shadow(color: .black.opacity(0.2 - (progress * 0.12)), radius: 10, y: 5)  // 20% → 8%

                // CONTENT - Dual layout system with crossfade
                // Full-screen layout (fade out) - has its own safe area handling
                if progress < 0.3 {
                    fullScreenLayout
                        .opacity(1.0 - (progress / 0.3))
                        .padding(.top, geometry.safeAreaInsets.top)
                }

                // Mini header layout (fade in) - positioned at BOTTOM of card
                if progress > 0.3 {
                    VStack(spacing: 0) {
                        Spacer()
                        miniHeaderLayout
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .opacity((progress - 0.3) / 0.7)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }

    // MARK: - Layout Variants

    private var fullScreenLayout: some View {
        ZStack(alignment: .topLeading) {
            // Emoji top-left
            Text(emoji)
                .font(.system(size: 42))
                .padding(.top, 60)
                .padding(.horizontal, 24)

            // Title + source bottom-left
            VStack(alignment: .leading, spacing: 4) {
                Spacer()
                Text(title)
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(3)
                Text(source.uppercased())
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.6))
            }
            .padding(.bottom, 140)  // Increased from 100 to give more space above controls
            .padding(.horizontal, 24)
        }
    }

    private var miniHeaderLayout: some View {
        HStack(alignment: .center, spacing: 12) {
            Text(emoji)
                .font(.system(size: 28))
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}
