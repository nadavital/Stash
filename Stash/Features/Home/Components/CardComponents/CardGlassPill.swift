import SwiftUI

/// Contextual glass pill shown at top-left of card
/// Shows friend attribution, AI recommendation, or content type
struct CardGlassPill: View {
    let emoji: String
    let type: EntityType
    let source: String
    let sharedByUser: ItemSummary.SharedByUser?

    var body: some View {
        HStack(spacing: 6) {
            if let friend = sharedByUser {
                // Friend attribution
                Text("from \(friend.name ?? friend.handle)")
                    .font(.system(size: 13, weight: .semibold))
                    .contentTransition(.interpolate)
            } else if source.lowercased() == "for you" {
                // AI recommendation
                Image(systemName: "sparkles")
                    .font(.system(size: 13))
                    .contentTransition(.symbolEffect(.replace))
                Text("FOR YOU")
                    .font(.system(size: 12, weight: .bold))
                    .contentTransition(.interpolate)
            } else {
                // Content type
                Text(emoji)
                    .font(.system(size: 16))
                    .contentTransition(.interpolate)
                Text(type.displayName.uppercased())
                    .font(.system(size: 12, weight: .bold))
                    .contentTransition(.interpolate)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .glassEffect()
        .animation(.easeInOut(duration: 0.3), value: emoji)
        .animation(.easeInOut(duration: 0.3), value: type)
        .animation(.easeInOut(duration: 0.3), value: sharedByUser?.userId)
    }
}
