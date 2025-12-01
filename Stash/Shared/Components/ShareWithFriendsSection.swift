import SwiftUI
import Combine

/// Share with Friends Section - One-click sharing with real friends
struct ShareWithFriendsSection: View {
    let item: ItemSummary
    @StateObject private var viewModel = ShareWithFriendsViewModel()
    @State private var showAddFriends = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Share with friends")
                .font(StashTypography.body.weight(.semibold))
                .foregroundColor(StashTheme.Color.textPrimary)

            if viewModel.isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Spacer()
                }
                .frame(height: 40)
            } else if viewModel.friends.isEmpty {
                // No friends - show add friends CTA
                Button(action: {
                    showAddFriends = true
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: "person.badge.plus")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Find and add friends")
                            .font(StashTypography.body.weight(.semibold))
                    }
                    .foregroundColor(StashTheme.Color.ai)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(StashTheme.Color.aiSoft)
                    .cornerRadius(StashTheme.Radius.button)
                }
                .buttonStyle(ScaleButtonStyle())
            } else {
                // Show real friends with one-click share
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(viewModel.friends.prefix(6)) { friend in
                            FriendShareButton(
                                friend: friend,
                                isShared: viewModel.isShared(friendId: friend.userId)
                            ) {
                                Task {
                                    await viewModel.toggleShare(item: item, friendId: friend.userId)
                                }
                            }
                        }

                        // Add more friends button
                        Button(action: {
                            showAddFriends = true
                        }) {
                            VStack(spacing: 4) {
                                ZStack {
                                    Circle()
                                        .fill(StashTheme.Color.surfaceSoft)
                                        .frame(width: 50, height: 50)

                                    Image(systemName: "plus")
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(StashTheme.Color.textSecondary)
                                }

                                Text("More")
                                    .font(StashTypography.caption)
                                    .foregroundColor(StashTheme.Color.textSecondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(16)
        .background(StashTheme.Color.surface)
        .cornerRadius(StashTheme.Radius.card)
        .padding(.horizontal, StashSpacing.screenHorizontal)
        .task {
            await viewModel.loadFriends()
        }
        .sheet(isPresented: $showAddFriends) {
            AddFriendsView()
        }
    }
}

/// Friend Share Button - One-click share toggle
struct FriendShareButton: View {
    let friend: Friend
    let isShared: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(isShared ? StashTheme.Color.accentSoft : StashTheme.Color.surfaceSoft)
                        .frame(width: 50, height: 50)

                    if isShared {
                        Circle()
                            .strokeBorder(StashTheme.Color.accent, lineWidth: 2)
                            .frame(width: 50, height: 50)
                    }

                    Text(friend.handle.prefix(1).uppercased())
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(isShared ? StashTheme.Color.accent : StashTheme.Color.textPrimary)
                }

                Text(friend.handle)
                    .font(StashTypography.caption)
                    .foregroundColor(isShared ? StashTheme.Color.accent : StashTheme.Color.textSecondary)
                    .lineLimit(1)
                    .frame(maxWidth: 60)
            }
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

/// ViewModel for managing friends and sharing
@MainActor
class ShareWithFriendsViewModel: ObservableObject {
    @Published var friends: [Friend] = []
    @Published var isLoading = false
    @Published var sharedFriendIds: Set<String> = []

    private let apiClient = APIClient.shared

    func loadFriends() async {
        isLoading = true
        do {
            friends = try await apiClient.getFriends()
        } catch {
            print("🔴 Error loading friends: \(error)")
        }
        isLoading = false
    }

    func isShared(friendId: String) -> Bool {
        sharedFriendIds.contains(friendId)
    }

    func toggleShare(item: ItemSummary, friendId: String) async {
        if sharedFriendIds.contains(friendId) {
            // Already shared - could add unshare functionality
            sharedFriendIds.remove(friendId)
        } else {
            // Share with friend
            do {
                try await apiClient.shareItem(itemId: item.itemId, friendId: friendId)
                sharedFriendIds.insert(friendId)
            } catch {
                print("🔴 Error sharing item: \(error)")
            }
        }
    }
}

/// Add Friends View - Placeholder for now
struct AddFriendsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            VStack {
                Text("Search for friends by handle")
                    .font(StashTypography.body)
                    .foregroundColor(StashTheme.Color.textSecondary)
                    .padding()

                // TODO: Implement friend search
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(StashTheme.Color.bg)
            .navigationTitle("Add Friends")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(StashTheme.Color.accent)
                }
            }
        }
    }
}

#Preview {
    ShareWithFriendsSection(item: .mockArticle)
        .padding()
        .background(StashTheme.Color.bg)
}
