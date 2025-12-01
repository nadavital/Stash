import SwiftUI
import Combine

/// Sheet for sharing an item with friends
struct ShareWithFriendsSheet: View {
    let item: ItemSummary
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ShareWithFriendsViewModel()
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if viewModel.isLoading {
                    ProgressView()
                        .frame(maxHeight: .infinity)
                } else if viewModel.friends.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "person.2")
                            .font(.system(size: 40))
                            .foregroundColor(StashTheme.Color.textMuted)
                        Text("No friends yet")
                            .font(StashTypography.cardTitle)
                            .foregroundColor(StashTheme.Color.textPrimary)
                        Text("Add friends to share items with them")
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.textSecondary)
                    }
                    .frame(maxHeight: .infinity)
                } else {
                    List {
                        ForEach(viewModel.friends) { friend in
                            Button {
                                Task {
                                    await viewModel.toggleShare(item: item, friendId: friend.userId)
                                }
                            } label: {
                                HStack {
                                    Circle()
                                        .fill(StashTheme.Color.surfaceSoft)
                                        .frame(width: 44, height: 44)
                                        .overlay(
                                            Text(friend.handle.prefix(1).uppercased())
                                                .font(.system(size: 18, weight: .semibold))
                                                .foregroundColor(StashTheme.Color.textPrimary)
                                        )
                                    
                                    Text("@\(friend.handle)")
                                        .font(StashTypography.body)
                                        .foregroundColor(StashTheme.Color.textPrimary)
                                    
                                    Spacer()
                                    
                                    if viewModel.isShared(friendId: friend.userId) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundColor(StashTheme.Color.accent)
                                    }
                                }
                            }
                            .listRowBackground(StashTheme.Color.surface)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Share with friend")
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
        .task {
            await viewModel.loadFriends()
        }
    }
}
