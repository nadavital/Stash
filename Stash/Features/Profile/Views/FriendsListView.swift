import SwiftUI

/// Friends list with taste similarity and management
/// Accessed from Profile sheet
struct FriendsListView: View {
    @Environment(\.dismiss) private var dismiss
    let friends: [Friend]

    @State private var showingAddFriend = false

    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg.ignoresSafeArea()

                if friends.isEmpty {
                    emptyState
                } else {
                    friendsList
                }
            }
            .navigationTitle("Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingAddFriend = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .font(.system(size: 16, weight: .medium))
                    }
                }
            }
            .sheet(isPresented: $showingAddFriend) {
                YourCodeView() // Opens to scan tab
            }
        }
    }

    // MARK: - Friends List

    private var friendsList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(friends) { friend in
                    NavigationLink {
                        FriendProfileView(friend: friend)
                    } label: {
                        HStack(spacing: 14) {
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

                            // Info
                            VStack(alignment: .leading, spacing: 4) {
                                Text(friend.name ?? friend.handle)
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(StashTheme.Color.textPrimary)

                                HStack(spacing: 6) {
                                    Text("@\(friend.handle)")
                                        .font(.system(size: 14))
                                        .foregroundStyle(StashTheme.Color.textMuted)

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

                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(StashTheme.Color.textMuted)
                        }
                        .padding()
                        .background(StashTheme.Color.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 24) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 60, weight: .light))
                .foregroundStyle(StashTheme.Color.textMuted)

            VStack(spacing: 8) {
                Text("No friends yet")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(StashTheme.Color.textPrimary)

                Text("Add friends to share and discover together")
                    .font(.system(size: 15))
                    .foregroundStyle(StashTheme.Color.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                showingAddFriend = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Add Friends")
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 14)
                .background(StashTheme.Color.accent)
                .clipShape(Capsule())
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Friend Profile View

struct FriendProfileView: View {
    let friend: Friend

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 12) {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [.blue, .blue.opacity(0.6)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 100, height: 100)
                        .overlay(
                            Text((friend.name ?? friend.handle).prefix(1).uppercased())
                                .font(.system(size: 44, weight: .bold))
                                .foregroundStyle(.white)
                        )

                    Text(friend.name ?? friend.handle)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(StashTheme.Color.textPrimary)

                    Text("@\(friend.handle)")
                        .font(.system(size: 16))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
                .padding(.top, 32)

                // Taste similarity
                if let similarity = friend.tasteSimilarity?.similarityScore {
                    VStack(spacing: 12) {
                        Text("Taste Match")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(StashTheme.Color.textMuted)
                            .textCase(.uppercase)

                        Text("\(Int(similarity * 100))%")
                            .font(.system(size: 48, weight: .bold))
                            .foregroundStyle(StashTheme.Color.accent)

                        // Progress bar
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule()
                                    .fill(StashTheme.Color.surfaceSoft)
                                    .frame(height: 8)

                                Capsule()
                                    .fill(StashTheme.Color.accent)
                                    .frame(width: geo.size.width * similarity, height: 8)
                            }
                        }
                        .frame(height: 8)
                        .padding(.horizontal, 40)
                    }
                    .padding()
                    .background(StashTheme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }

                // Common interests
                if let commonInterests = friend.tasteSimilarity?.commonInterests, !commonInterests.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Common Interests")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(StashTheme.Color.textMuted)
                            .textCase(.uppercase)

                        // Simple wrapping layout
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(commonInterests, id: \.self) { interest in
                                Text(interest)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(StashTheme.Color.textPrimary)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(StashTheme.Color.surfaceSoft)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(StashTheme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }

                // TODO: Shared items section
            }
            .padding()
        }
        .background(StashTheme.Color.bg.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Preview

#Preview("With Friends") {
    FriendsListView(friends: [
        Friend(
            userId: "user1",
            handle: "sarah",
            name: "Sarah",
            tasteSimilarity: Friend.TasteSimilarity(
                similarityScore: 0.87,
                commonInterests: ["recipes", "music", "tech"]
            )
        ),
        Friend(
            userId: "user2",
            handle: "jake",
            name: "Jake",
            tasteSimilarity: Friend.TasteSimilarity(
                similarityScore: 0.65,
                commonInterests: ["movies", "games"]
            )
        )
    ])
}

#Preview("Empty") {
    FriendsListView(friends: [])
}
