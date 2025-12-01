import SwiftUI

/// Display a primary emoji for an entity
struct EmojiView: View {
    let emoji: String
    let size: CGFloat

    init(_ emoji: String, size: CGFloat = 40) {
        self.emoji = emoji
        self.size = size
    }

    var body: some View {
        Text(emoji)
            .font(.system(size: size))
    }
}

#Preview {
    VStack(spacing: 20) {
        EmojiView("🤖", size: 40)
        EmojiView("🎵", size: 60)
        EmojiView("🎫", size: 80)
    }
    .padding()
}
