import SwiftUI

/// Message bubble for chat conversations
/// Shows user messages and AI responses with referenced items
struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.isUser {
                Spacer(minLength: 60)
            } else {
                // Synapse lens indicator
                AdaptiveSynapseLens(size: 28, state: .idle)
                    .padding(.top, 4)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 8) {
                Text(message.text)
                    .font(.body)
                    .foregroundStyle(message.isUser ? .white : .primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        message.isUser
                            ? StashTheme.Color.accent
                            : Color.gray.opacity(0.15)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                // Show items if present
                if !message.referencedItems.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
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
        HStack(alignment: .top, spacing: 8) {
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
            VStack(alignment: .leading, spacing: 4) {
                Text(item.primaryEmoji)
                    .font(.system(size: 24))

                Text(item.title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Text(item.type.displayName)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .frame(width: 130, alignment: .leading)
            .padding()
            .background(Color.gray.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
