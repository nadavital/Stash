import SwiftUI

/// Temporary debug view for managing stash items during development
/// TODO: Replace with proper profile view later
struct DebugProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = DebugViewModel()
    @State private var showingDeleteAllConfirmation = false

    /// Callback to refresh the home feed when items change
    let onRefresh: (() async -> Void)?

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                Color(.systemBackground).ignoresSafeArea()

                // Content
                if viewModel.isLoading && viewModel.allItems.isEmpty {
                    VStack(spacing: 16) {
                        ProgressView()
                            .tint(StashTheme.Color.accent)
                        Text("Loading items...")
                            .foregroundStyle(.secondary)
                    }
                } else if viewModel.allItems.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "tray")
                            .font(.system(size: 60))
                            .foregroundStyle(.tertiary)
                        Text("No items in stash")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                } else {
                    List {
                        Section {
                            ForEach(viewModel.allItems) { item in
                                itemRow(item)
                            }
                        } header: {
                            HStack {
                                Text("\(viewModel.allItems.count) Items")
                                    .font(.system(size: 13, weight: .semibold))
                                    .textCase(.uppercase)
                                Spacer()
                                Button("Delete All") {
                                    showingDeleteAllConfirmation = true
                                }
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.red)
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Debug: Your Stash")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(StashTheme.Color.accent)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await viewModel.refresh()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .foregroundStyle(StashTheme.Color.accent)
                    }
                    .disabled(viewModel.isLoading)
                }
            }
            .task {
                // Set the refresh callback
                viewModel.onRefresh = onRefresh
                // Load items
                await viewModel.loadAllItems()
            }
            .alert("Delete All Items", isPresented: $showingDeleteAllConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete All", role: .destructive) {
                    Task {
                        await viewModel.deleteAllItems()
                    }
                }
            } message: {
                Text("Are you sure you want to delete all \(viewModel.allItems.count) items? This cannot be undone.")
            }
        }
    }

    // MARK: - Item Row

    @ViewBuilder
    private func itemRow(_ item: ItemSummary) -> some View {
        HStack(spacing: 12) {
            // Emoji
            Text(item.primaryEmoji)
                .font(.system(size: 24))

            // Title and Type
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(item.type.rawValue)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
            }

            Spacer()
        }
        .padding(.vertical, 8)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task {
                    await viewModel.deleteItem(item)
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .listRowBackground(Color(.secondarySystemBackground))
    }
}
