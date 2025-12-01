import SwiftUI

/// Reusable hero image component with gradient overlay for detail views
struct HeroImageView: View {
    let iconUrl: String?
    let emoji: String
    let height: CGFloat
    let ignoreTopSafeArea: Bool

    init(
        iconUrl: String?,
        emoji: String,
        height: CGFloat,
        ignoreTopSafeArea: Bool = false
    ) {
        self.iconUrl = iconUrl
        self.emoji = emoji
        self.height = height
        self.ignoreTopSafeArea = ignoreTopSafeArea
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                // Image or emoji fallback
                if let iconUrl = iconUrl, let url = URL(string: iconUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: geometry.size.width, height: height)
                            .clipped()
                    } placeholder: {
                        ZStack {
                            Rectangle()
                                .fill(StashTheme.Color.surfaceSoft)
                                .frame(width: geometry.size.width, height: height)
                            ProgressView()
                        }
                    }
                } else {
                    // Emoji fallback
                    ZStack {
                        Rectangle()
                            .fill(StashTheme.Color.surfaceSoft)
                            .frame(width: geometry.size.width, height: height)
                        EmojiView(emoji, size: StashSpacing.heroEmojiFallback)
                    }
                }

                // Gradient overlay (bottom 50% with 0% → 45% opacity for calmer design)
                LinearGradient(
                    gradient: Gradient(stops: [
                        .init(color: Color.black.opacity(0.0), location: 0.0),
                        .init(color: Color.black.opacity(0.2), location: 0.5),
                        .init(color: Color.black.opacity(0.45), location: 1.0)
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(width: geometry.size.width, height: height * 0.5)
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
        .if(ignoreTopSafeArea) { view in
            view.ignoresSafeArea(edges: .top)
        }
    }
}

// Helper extension for conditional modifiers
extension View {
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

#Preview {
    VStack(spacing: 0) {
        HeroImageView(
            iconUrl: "https://example.com/image.jpg",
            emoji: "🎵",
            height: StashSpacing.heroSongHeight,
            ignoreTopSafeArea: true
        )

        Text("Content below hero")
            .padding()

        Spacer()
    }
    .background(StashTheme.Color.bg)
}
