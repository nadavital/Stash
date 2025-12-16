import SwiftUI

/// Message bubble for chat conversations
/// Shows user messages and AI responses with referenced items
struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            if message.isUser {
                Spacer(minLength: 60)
            } else {
                // Synapse lens indicator
                AdaptiveSynapseLens(size: 28, state: .idle)
                    .padding(.top, 4)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: Spacing.sm) {
                Text(message.text)
                    .font(Typography.body)
                    .foregroundStyle(message.isUser ? .white : StashTheme.Color.textPrimary)
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(
                        message.isUser
                            ? StashTheme.Color.accent
                            : StashTheme.Color.surface
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                // Show items if present
                if !message.referencedItems.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.sm) {
                            ForEach(message.referencedItems) { item in
                                CompactResultCard(item: item)
                            }
                        }
                    }
                }
            }

            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Loading Bubble

struct LoadingBubble: View {
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            AdaptiveSynapseLens(size: 32, state: .thinking)
                .padding(.top, 4)

            Spacer(minLength: 60)
        }
    }
}

// MARK: - Compact Result Card

struct CompactResultCard: View {
    let item: ItemSummary

    var body: some View {
        // TODO: Add navigation when detail views are rebuilt
        Button {
            // Placeholder
        } label: {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                Text(item.primaryEmoji)
                    .font(.system(size: 24))

                Text(item.title)
                    .font(Typography.caption.weight(.medium))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(2)

                Text(item.type.displayName)
                    .font(Typography.caption2)
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            .frame(width: 130, alignment: .leading)
            .padding()
            .background(StashTheme.Color.surfaceSoft)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
