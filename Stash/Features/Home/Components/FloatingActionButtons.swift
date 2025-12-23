import SwiftUI

/// Floating action buttons that appear in detail views
struct FloatingActionButtons: View {
    let item: ItemSummary
    @State private var isLiked: Bool = false
    @State private var showDeleteConfirmation: Bool = false
    @State private var showShareSheet: Bool = false

    var body: some View {
        VStack(spacing: 12) {
            Spacer()

            HStack {
                Spacer()

                VStack(spacing: 12) {
                    // Like button
                    ActionButton(
                        icon: isLiked ? "heart.fill" : "heart",
                        tintColor: isLiked ? .red : nil
                    ) {
                        Haptics.light()
                        Task {
                            await toggleLike()
                        }
                    }

                    // Share button
                    ActionButton(
                        icon: "paperplane.fill",
                        tintColor: nil
                    ) {
                        Haptics.light()
                        showShareSheet = true
                    }

                    // More menu (contains delete)
                    Menu {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete from Stash", systemImage: "trash")
                        }
                    } label: {
                        ActionButton(
                            icon: "ellipsis",
                            tintColor: nil
                        ) {}
                    }
                }
            }
            .padding(.trailing, 24)
            .padding(.bottom, 40)
        }
        .confirmationDialog(
            "Delete this item from your stash?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task {
                    await deleteItem()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showShareSheet) {
            // TODO: Friend picker sheet
            Text("Share with friends")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
        }
    }

    private func toggleLike() async {
        if isLiked {
            await ItemActionsManager.shared.unlikeItem(
                itemId: item.itemId,
                onOptimisticUpdate: { isLiked = false },
                onRollback: { isLiked = true }
            )
        } else {
            await ItemActionsManager.shared.likeItem(
                itemId: item.itemId,
                onOptimisticUpdate: { isLiked = true },
                onRollback: { isLiked = false }
            )
        }
    }

    private func deleteItem() async {
        do {
            try await ItemActionsManager.shared.deleteItem(itemId: item.itemId)
            // TODO: Dismiss detail view and remove from deck
            Haptics.medium()
        } catch {
            print("🔴 Error deleting item: \(error)")
        }
    }
}

// MARK: - Action Button Component

struct ActionButton: View {
    let icon: String
    let tintColor: Color?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .frame(width: 56, height: 56)
        }
        .glassEffect(tintColor != nil ? .regular.tint(tintColor!) : .regular, in: .circle)
    }
}
