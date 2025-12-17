import SwiftUI

/// Shared card content that morphs between full-screen (deck mode) and miniature (detail/chat mode)
/// Uses matchedGeometryEffect for smooth transitions
struct CardContent: View {
    let emoji: String
    let title: String
    let source: String
    let backgroundColor: Color
    let isFullScreen: Bool
    var onTap: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: isFullScreen ? 12 : 6) {
            Text(emoji)
                .font(.system(size: isFullScreen ? 32 : 20))

            Text(title)
                .font(.system(size: isFullScreen ? 32 : 14, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(isFullScreen ? 2 : 1)
                .shadow(color: isFullScreen ? .black.opacity(0.3) : .clear, radius: 8, y: 4)

            Text(source)
                .font(.system(size: isFullScreen ? 14 : 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, isFullScreen ? 24 : 16)
        .padding(.top, isFullScreen ? 24 : 12)
        .padding(.bottom, isFullScreen ? 140 : 12)
        .frame(maxWidth: .infinity, maxHeight: isFullScreen ? .infinity : nil, alignment: isFullScreen ? .bottomLeading : .topLeading)
        .background(backgroundColor)
        .clipShape(RoundedRectangle(cornerRadius: isFullScreen ? 24 : 16))
        .if(!isFullScreen && onTap != nil) { view in
            view.onTapGesture {
                onTap?()
            }
        }
    }
}

// Helper for conditional modifiers
extension View {
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

#Preview("Full Screen") {
    CardContent(
        emoji: "📰",
        title: "How AI is Changing Everything",
        source: "The New York Times",
        backgroundColor: Color(red: 0.8, green: 0.2, blue: 0.2),
        isFullScreen: true
    )
}

#Preview("Miniature") {
    CardContent(
        emoji: "📰",
        title: "How AI is Changing Everything",
        source: "The New York Times",
        backgroundColor: Color(red: 0.8, green: 0.2, blue: 0.2),
        isFullScreen: false
    )
    .padding()
    .background(Color.black)
}
