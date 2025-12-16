import SwiftUI

/// Full searchable/filterable list of user's stash
/// Extracted from YouView for Profile sheet
struct StashListView: View {
    @Environment(\.dismiss) private var dismiss
    let items: [ItemSummary]

    @State private var searchText = ""
    @State private var selectedFilter: EntityType?

    var filteredItems: [ItemSummary] {
        var result = items

        // Apply search filter
        if !searchText.isEmpty {
            result = result.filter { item in
                item.title.localizedCaseInsensitiveContains(searchText) ||
                item.summary.localizedCaseInsensitiveContains(searchText)
            }
        }

        // Apply type filter
        if let selectedFilter {
            result = result.filter { $0.type == selectedFilter }
        }

        return result
    }

    var availableTypes: [EntityType] {
        let types = Set(items.map { $0.type })
        return Array(types).sorted { $0.displayName < $1.displayName }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                searchBar

                // Type filter pills
                if !availableTypes.isEmpty {
                    typeFilterRow
                }

                // Items list
                if filteredItems.isEmpty {
                    emptyState
                } else {
                    itemsList
                }
            }
            .background(StashTheme.Color.bg.ignoresSafeArea())
            .navigationTitle("Your Stash")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(StashTheme.Color.textMuted)

            TextField("Search your stash", text: $searchText)
                .foregroundStyle(StashTheme.Color.textPrimary)

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
        }
        .padding(12)
        .background(StashTheme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding()
    }

    // MARK: - Type Filter Row

    private var typeFilterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // All filter
                FilterPill(
                    title: "All",
                    emoji: nil,
                    isSelected: selectedFilter == nil
                ) {
                    selectedFilter = nil
                }

                // Type filters
                ForEach(availableTypes, id: \.self) { type in
                    FilterPill(
                        title: type.displayName,
                        emoji: type.emoji,
                        isSelected: selectedFilter == type
                    ) {
                        selectedFilter = type
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.bottom, 8)
    }

    // MARK: - Items List

    private var itemsList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(filteredItems) { item in
                    // TODO: Add navigation when detail views are rebuilt
                    StashItemRow(item: item)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: searchText.isEmpty ? "tray" : "magnifyingglass")
                .font(.system(size: 50))
                .foregroundStyle(StashTheme.Color.textMuted)

            Text(searchText.isEmpty ? "Your stash is empty" : "No results found")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textPrimary)

            Text(searchText.isEmpty ? "Save something to get started" : "Try a different search")
                .font(.system(size: 15))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Filter Pill

struct FilterPill: View {
    let title: String
    let emoji: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            HStack(spacing: 6) {
                if let emoji {
                    Text(emoji)
                        .font(.system(size: 14))
                }
                Text(title)
                    .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? StashTheme.Color.accent : StashTheme.Color.surface)
            .foregroundStyle(isSelected ? .white : StashTheme.Color.textPrimary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview("With Items") {
    StashListView(items: [.mockArticle, .mockSong, .mockArticle])
}

#Preview("Empty") {
    StashListView(items: [])
}
