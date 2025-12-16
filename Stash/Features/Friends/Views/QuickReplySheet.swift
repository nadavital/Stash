import SwiftUI

/// Quick reply sheet when tapping friend attribution pill
/// Allows quick reactions: text message, emoji, or view friend profile
struct QuickReplySheet: View {
    @Environment(\.dismiss) private var dismiss
    let friend: ItemSummary.SharedByUser
    let item: ItemSummary

    @State private var replyText = ""
    @FocusState private var isTextFocused: Bool

    // Quick emoji reactions
    private let quickEmojis = ["❤️", "🔥", "😂", "👍", "🤔", "😍", "🙌", "👏"]

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle
            dragHandle

            // Friend header
            friendHeader

            Divider()

            // What they shared
            sharedItemPreview

            Divider()
                .padding(.vertical, 8)

            // Quick emoji reactions
            emojiReactionsRow

            Divider()
                .padding(.vertical, 8)

            // Text reply
            textReplySection

            // Action buttons
            actionButtons
        }
        .padding(.horizontal)
        .padding(.bottom)
        .background(StashTheme.Color.bg)
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
    }

    // MARK: - Drag Handle

    private var dragHandle: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(StashTheme.Color.textMuted.opacity(0.3))
            .frame(width: 36, height: 5)
            .padding(.vertical, 8)
    }

    // MARK: - Friend Header

    private var friendHeader: some View {
        HStack(spacing: 12) {
            // Avatar
            Circle()
                .fill(
                    LinearGradient(
                        colors: [.blue, .blue.opacity(0.6)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 50, height: 50)
                .overlay(
                    Text((friend.name ?? friend.handle).prefix(1).uppercased())
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(friend.name ?? friend.handle)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textPrimary)

                Text("@\(friend.handle)")
                    .font(.system(size: 14))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }

            Spacer()

            // View profile button
            Button {
                // TODO: Navigate to friend profile
                dismiss()
            } label: {
                Text("View")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(StashTheme.Color.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(StashTheme.Color.accent.opacity(0.1))
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 12)
    }

    // MARK: - Shared Item Preview

    private var sharedItemPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("shared with you")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(StashTheme.Color.textMuted)
                .textCase(.uppercase)

            HStack(spacing: 12) {
                Text(item.primaryEmoji)
                    .font(.system(size: 24))

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(StashTheme.Color.textPrimary)
                        .lineLimit(2)

                    Text(item.type.displayName)
                        .font(.system(size: 12))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }

                Spacer()
            }
            .padding(12)
            .background(StashTheme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.vertical, 8)
    }

    // MARK: - Emoji Reactions

    private var emojiReactionsRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Quick reaction")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(StashTheme.Color.textMuted)
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(quickEmojis, id: \.self) { emoji in
                        Button {
                            sendEmojiReaction(emoji)
                        } label: {
                            Text(emoji)
                                .font(.system(size: 28))
                                .frame(width: 52, height: 52)
                                .background(StashTheme.Color.surface)
                                .clipShape(Circle())
                        }
                    }
                }
            }
        }
    }

    // MARK: - Text Reply

    private var textReplySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Send a message")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(StashTheme.Color.textMuted)
                .textCase(.uppercase)

            HStack(spacing: 8) {
                TextField("Thanks for sharing!", text: $replyText, axis: .vertical)
                    .font(.system(size: 15))
                    .focused($isTextFocused)
                    .lineLimit(1...3)
                    .padding(12)
                    .background(StashTheme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                if !replyText.isEmpty {
                    Button {
                        sendTextReply()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(StashTheme.Color.accent)
                    }
                }
            }
        }
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            Button {
                dismiss()
            } label: {
                Text("Maybe Later")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(StashTheme.Color.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(StashTheme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Button {
                // TODO: Mark as "will check out later"
                Haptics.success()
                dismiss()
            } label: {
                Text("I'll Check This Out")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(StashTheme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(.top, 8)
    }

    // MARK: - Actions

    private func sendEmojiReaction(_ emoji: String) {
        Haptics.success()
        // TODO: Send emoji reaction to backend
        dismiss()
    }

    private func sendTextReply() {
        guard !replyText.isEmpty else { return }
        Haptics.success()
        // TODO: Send text reply to backend
        dismiss()
    }
}

// MARK: - Preview

#Preview {
    Color.clear
        .sheet(isPresented: .constant(true)) {
            QuickReplySheet(
                friend: ItemSummary.SharedByUser(
                    userId: "user1",
                    handle: "sarah",
                    name: "Sarah"
                ),
                item: .mockArticle
            )
        }
}
