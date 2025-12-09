import SwiftUI
import Combine

/// Friends list view
struct FriendsView: View {
    @StateObject private var viewModel = FriendsViewModel()
    @State private var showAddFriend = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Background fills entire screen
                StashTheme.Color.bg.ignoresSafeArea()

                VStack {
                    if viewModel.isLoading && viewModel.friends.isEmpty {
                        ProgressView("Loading friends...")
                            .foregroundColor(StashTheme.Color.textSecondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if viewModel.friends.isEmpty {
                    EmptyStateView(
                        title: "No Friends Yet",
                        message: "Add friends to share your favorite finds with them",
                        systemImage: "person.2"
                    )
                } else {
                    List {
                        ForEach(viewModel.friends) { friend in
                            FriendRow(friend: friend)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.removeFriend(friendId: friend.userId)
                                    }
                                } label: {
                                    Label("Remove", systemImage: "person.badge.minus")
                                }
                            }
                        }
                        .listRowBackground(StashTheme.Color.surface)
                    }
                    .scrollContentBackground(.hidden)
                }

                    if let error = viewModel.error {
                        VStack {
                            Spacer()
                            VStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle")
                                    .font(.title2)
                                    .foregroundColor(StashTheme.Color.danger)

                                Text("Unable to load friends")
                                    .font(StashTypography.cardTitle)
                                    .foregroundColor(StashTheme.Color.textPrimary)

                                Text(error.localizedDescription)
                                    .font(StashTypography.body)
                                    .foregroundColor(StashTheme.Color.textSecondary)
                                    .multilineTextAlignment(.center)

                                Button("Try Again") {
                                    Task {
                                        await viewModel.loadFriends()
                                    }
                                }
                                .font(StashTypography.body)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(StashTheme.Color.accent)
                                .foregroundColor(StashTheme.Color.textPrimary)
                                .cornerRadius(StashTheme.Radius.pill)
                                .padding(.top, 8)
                            }
                            .padding()
                            .background(StashTheme.Color.surface)
                            .cornerRadius(StashTheme.Radius.card)
                            .shadow(
                                color: StashTheme.Shadow.soft.color,
                                radius: StashTheme.Shadow.soft.radius,
                                x: StashTheme.Shadow.soft.x,
                                y: StashTheme.Shadow.soft.y
                            )
                            .padding()
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Friends")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showAddFriend = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .foregroundColor(StashTheme.Color.accent)
                    }
                }
            }
            .sheet(isPresented: $showAddFriend) {
                AddFriendView()
            }
            .refreshable {
                await viewModel.loadFriends()
            }
            .task {
                await viewModel.loadFriends()
            }
        }
    }
}

@MainActor
class FriendsViewModel: ObservableObject {
    @Published var friends: [Friend] = []
    @Published var isLoading = false
    @Published var error: Error?

    private let apiClient = APIClient.shared

    func loadFriends() async {
        isLoading = true
        error = nil

        do {
            friends = try await apiClient.getFriends()
        } catch {
            self.error = error
        }

        isLoading = false
    }

    func removeFriend(friendId: String) async {
        do {
            try await apiClient.removeFriend(friendId: friendId)
            friends.removeAll { $0.userId == friendId }
        } catch {
            self.error = error
        }
    }
}

// MARK: - Friend Row with Taste Similarity
struct FriendRow: View {
    let friend: Friend
    
    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            Circle()
                .fill(StashTheme.Color.aiSoft)
                .frame(width: 50, height: 50)
                .overlay(
                    Text(friend.handle.prefix(1).uppercased())
                        .font(StashTypography.sectionTitle)
                        .foregroundColor(StashTheme.Color.ai)
                )
            
            // Name and handle
            VStack(alignment: .leading, spacing: 4) {
                if let name = friend.name {
                    Text(name)
                        .font(StashTypography.cardTitle)
                        .foregroundColor(StashTheme.Color.textPrimary)
                }
                Text("@\(friend.handle)")
                    .font(StashTypography.body)
                    .foregroundColor(StashTheme.Color.textSecondary)
                
                // Common interests
                if let similarity = friend.tasteSimilarity,
                   let interests = similarity.commonInterests,
                   !interests.isEmpty {
                    Text(interests.prefix(3).joined(separator: " • "))
                        .font(StashTypography.caption)
                        .foregroundColor(StashTheme.Color.ai)
                        .lineLimit(1)
                }
            }
            
            Spacer()
            
            // Taste match indicator
            if let similarity = friend.tasteSimilarity,
               let score = similarity.similarityScore {
                TasteMatchBadge(score: score)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Taste Match Badge
struct TasteMatchBadge: View {
    let score: Double
    
    private var matchLevel: (text: String, color: Color) {
        switch score {
        case 0.8...: return ("🔥", StashTheme.Color.accent)
        case 0.6..<0.8: return ("✨", StashTheme.Color.ai)
        case 0.4..<0.6: return ("👍", StashTheme.Color.success)
        default: return ("", .clear)
        }
    }
    
    var body: some View {
        if score >= 0.4 {
            HStack(spacing: 4) {
                Text(matchLevel.text)
                    .font(.caption)
                
                Text("\(Int(score * 100))%")
                    .font(StashTypography.caption.bold())
                    .foregroundColor(matchLevel.color)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(matchLevel.color.opacity(0.15))
            .cornerRadius(StashTheme.Radius.pill)
        }
    }
}

#Preview {
    FriendsView()
}
