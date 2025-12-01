import SwiftUI
import Combine

/// Sheet for sharing an item with a friend
struct ShareItemView: View {
    let item: ItemSummary
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ShareItemViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg.ignoresSafeArea()

                VStack(spacing: StashSpacing.sectionVertical) {
                    if viewModel.isLoading {
                        ProgressView("Loading friends...")
                            .foregroundColor(StashTheme.Color.textSecondary)
                            .frame(maxHeight: .infinity)
                    } else if viewModel.friends.isEmpty {
                        EmptyStateView(
                            title: "No Friends Yet",
                            message: "Add friends to share items with them",
                            systemImage: "person.2"
                        )
                    } else {
                        List(viewModel.friends) { friend in
                            Button {
                                Task {
                                    await viewModel.shareItem(item: item, friendId: friend.userId)
                                    if viewModel.shareSuccess {
                                        dismiss()
                                    }
                                }
                            } label: {
                                HStack {
                                    Circle()
                                        .fill(StashTheme.Color.aiSoft)
                                        .frame(width: 50, height: 50)
                                        .overlay(
                                            Text(friend.handle.prefix(1).uppercased())
                                                .font(StashTypography.sectionTitle)
                                                .foregroundColor(StashTheme.Color.ai)
                                        )

                                    VStack(alignment: .leading, spacing: 4) {
                                        if let name = friend.name {
                                            Text(name)
                                                .font(StashTypography.cardTitle)
                                                .foregroundColor(StashTheme.Color.textPrimary)
                                        }
                                        Text("@\(friend.handle)")
                                            .font(StashTypography.body)
                                            .foregroundColor(StashTheme.Color.textSecondary)
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .foregroundColor(StashTheme.Color.textMuted)
                                }
                            }
                            .disabled(viewModel.isSharing)
                            .listRowBackground(StashTheme.Color.surface)
                        }
                        .scrollContentBackground(.hidden)
                    }

                    if let error = viewModel.error {
                        Text(error.localizedDescription)
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.danger)
                            .padding()
                    }
                }
            }
            .navigationTitle("Share with Friend")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(StashTheme.Color.textSecondary)
                }
            }
            .task {
                await viewModel.loadFriends()
            }
        }
    }
}

@MainActor
class ShareItemViewModel: ObservableObject {
    @Published var friends: [Friend] = []
    @Published var isLoading = false
    @Published var isSharing = false
    @Published var error: Error?
    @Published var shareSuccess = false

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

    func shareItem(item: ItemSummary, friendId: String) async {
        isSharing = true
        error = nil

        do {
            try await apiClient.shareItem(itemId: item.itemId, friendId: friendId)
            shareSuccess = true
        } catch {
            self.error = error
        }

        isSharing = false
    }
}
