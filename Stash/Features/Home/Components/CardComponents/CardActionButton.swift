import SwiftUI

/// Quick action button for cards (pill-shaped with icon + text)
struct CardActionButton: View {
    let type: EntityType
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: actionIcon)
                    .font(.system(size: 18, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace))
                Text(actionLabel)
                    .font(.system(size: 16, weight: .semibold))
                    .contentTransition(.interpolate)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 24)
            .frame(height: 56)
        }
        .glassEffect(.regular.tint(StashTheme.Color.accent), in: .capsule)
        .animation(.easeInOut(duration: 0.3), value: actionLabel)
        .animation(.easeInOut(duration: 0.3), value: actionIcon)
    }

    private var actionLabel: String {
        switch type {
        case .song: return "Play"
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel: return "Watch"
        default: return "View"
        }
    }

    private var actionIcon: String {
        switch type {
        case .song: return "play.fill"
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel: return "play.circle.fill"
        default: return "arrow.right.circle.fill"
        }
    }
}
