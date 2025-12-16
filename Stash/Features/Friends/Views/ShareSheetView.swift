import SwiftUI

/// Custom share sheet with AI-ranked friends
/// Shows friends sorted by taste relevance for the item being shared
struct ShareSheetView: View {
    @Environment(\.dismiss) private var dismiss
    let item: ItemSummary

    @State private var friends: [Friend] = []
    @State private var selectedFriends: Set<String> = []
    @State private var isLoading = true
    @State private var shareMessage = ""
    @FocusState private var isMessageFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Item preview
                itemPreview

                Divider()

                // Friends list
                if isLoading {
                    loadingState
                } else if friends.isEmpty {
                    emptyState
                } else {
                    friendsList
                }

                // Share button (bottom)
                shareButton
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Share with")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadFriends()
        }
    }

    // MARK: - Item Preview

    private var itemPreview: some View {
        HStack(spacing: 12) {
            // Emoji
            Text(item.primaryEmoji)
                .font(.system(size: 32))
                .frame(width: 50, height: 50)
                .background(StashTheme.Color.surfaceSoft)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(2)

                Text(item.type.displayName)
                    .font(.system(size: 13))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }

            Spacer()
        }
        .padding()
    }

    // MARK: - Friends List

    private var friendsList: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Optional message
                messageSection

                // Friends (AI-ranked by relevance)
                LazyVStack(spacing: 0) {
                    ForEach(friends) { friend in
                        friendRow(friend)

                        if friend.id != friends.last?.id {
                            Divider()
                                .padding(.leading, 72)
                        }
                    }
                }
            }
        }
    }

    private var messageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Add a message (optional)")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(StashTheme.Color.textMuted)
                .padding(.horizontal, 16)

            TextField("Say something...", text: $shareMessage, axis: .vertical)
                .font(.system(size: 15))
                .focused($isMessageFocused)
                .lineLimit(1...3)
                .padding(12)
                .background(StashTheme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
        }
        .padding(.vertical, 12)
    }

    private func friendRow(_ friend: Friend) -> some View {
        Button {
            Haptics.light()
            if selectedFriends.contains(friend.userId) {
                selectedFriends.remove(friend.userId)
            } else {
                selectedFriends.insert(friend.userId)
            }
        } label: {
            HStack(spacing: 14) {
                // Selection indicator
                ZStack {
                    Circle()
                        .stroke(StashTheme.Color.borderSubtle, lineWidth: 2)
                        .frame(width: 24, height: 24)

                    if selectedFriends.contains(friend.userId) {
                        Circle()
                            .fill(StashTheme.Color.accent)
                            .frame(width: 24, height: 24)

                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }

                // Avatar
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.blue, .blue.opacity(0.6)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .overlay(
                        Text((friend.name ?? friend.handle).prefix(1).uppercased())
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white)
                    )

                // Info
                VStack(alignment: .leading, spacing: 3) {
                    Text(friend.name ?? friend.handle)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(StashTheme.Color.textPrimary)

                    HStack(spacing: 6) {
                        Text("@\(friend.handle)")
                            .font(.system(size: 14))
                            .foregroundStyle(StashTheme.Color.textMuted)

                        // Show taste match if available
                        if let similarity = friend.tasteSimilarity?.similarityScore {
                            Text("•")
                                .foregroundStyle(StashTheme.Color.textMuted)
                            Text("\(Int(similarity * 100))% match")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(StashTheme.Color.accent)
                        }
                    }
                }

                Spacer()
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Share Button

    private var shareButton: some View {
        VStack(spacing: 0) {
            Divider()

            Button {
                Task {
                    await shareWithSelectedFriends()
                }
            } label: {
                Text("Share with \(selectedFriends.count) \(selectedFriends.count == 1 ? "friend" : "friends")")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(selectedFriends.isEmpty ? StashTheme.Color.textMuted : StashTheme.Color.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(selectedFriends.isEmpty)
            .padding()
        }
        .background(StashTheme.Color.bg)
    }

    // MARK: - Loading/Empty States

    private var loadingState: some View {
        VStack {
            ProgressView()
            Text("Loading friends...")
                .font(.system(size: 14))
                .foregroundStyle(StashTheme.Color.textMuted)
                .padding(.top, 8)
        }
        .frame(maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 50))
                .foregroundStyle(StashTheme.Color.textMuted)

            Text("No friends yet")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textPrimary)

            Text("Add friends to share with them")
                .font(.system(size: 14))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Data Loading

    private func loadFriends() async {
        // TODO: Call backend to get AI-ranked friends for this item
        // For now, use mock data
        try? await Task.sleep(for: .milliseconds(500))
        friends = []
        isLoading = false
    }

    private func shareWithSelectedFriends() async {
        guard !selectedFriends.isEmpty else { return }

        Haptics.success()

        // TODO: Call backend to share item with selected friends
        // Backend should create notifications and add to their feeds

        dismiss()
    }
}

// MARK: - Preview

#Preview {
    ShareSheetView(item: .mockArticle)
}
