import SwiftUI

/// Main Today tab view - shows the daily feed
struct TodayView: View {
    @StateObject private var viewModel = TodayViewModel()
    @State private var showingAddItem = false
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var searchResults: [ItemSummary] = []
    @State private var isSearchLoading = false
    @State private var selectedFilter: EntityType? = nil

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search Bar
                SearchBarView(
                    text: $searchText,
                    isSearching: $isSearching,
                    placeholder: "Search your stash..."
                )
                .padding(.horizontal, StashSpacing.screenHorizontal)
                .padding(.top, 8)
                .padding(.bottom, 8)
                
                // Type Filter Pills (only show when not searching)
                if !isSearching {
                    TypeFilterBar(selectedFilter: $selectedFilter)
                        .padding(.bottom, 8)
                }

                // Content
                if isSearching && !searchText.isEmpty {
                    // Search Results
                    SearchResultsView(
                        results: searchResults,
                        isLoading: isSearchLoading,
                        query: searchText
                    )
                } else {
                    // Regular Feed (filtered)
                    feedContent
                }
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Today in your stash")
            .refreshable {
                await viewModel.refresh()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingAddItem = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                            .foregroundColor(StashTheme.Color.accent)
                    }
                }
            }
            .sheet(isPresented: $showingAddItem) {
                // Refresh feed when sheet is dismissed
                Task {
                    await viewModel.refresh()
                }
            } content: {
                AddItemView()
            }
        }
        .task {
            if viewModel.feed == nil {
                await viewModel.fetchFeed()
            }
        }
        .onChange(of: searchText) { _, newValue in
            Task {
                await performSearch(query: newValue)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .itemDeleted)) { _ in
            Task {
                await viewModel.refresh()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name("RefreshFeed"))) { _ in
            Task {
                await viewModel.refresh()
            }
        }
    }
    
    // Filter items by selected type
    private func filterItems(_ items: [ItemSummary]) -> [ItemSummary] {
        guard let filter = selectedFilter else { return items }
        return items.filter { $0.type == filter }
    }

    @ViewBuilder
    private var feedContent: some View {
        ScrollView {
            if viewModel.isLoading && viewModel.feed == nil {
                LoadingView(message: "Loading your stash...")
                    .frame(height: 400)
            } else if let feed = viewModel.feed {
                VStack(alignment: .leading, spacing: StashSpacing.sectionVertical) {
                    // AI Subtitle
                    Text(feed.aiSubtitle)
                        .font(StashTypography.body)
                        .foregroundColor(StashTheme.Color.textSecondary)
                        .padding(.horizontal, StashSpacing.screenHorizontal)

                    // Brain Snack Section - what you could do right now
                    let filteredBrainSnack = filterItems(feed.brainSnack)
                    if !filteredBrainSnack.isEmpty {
                        SectionView(title: "Right now you could...") {
                            ForEach(filteredBrainSnack) { item in
                                NavigationLink(destination: ItemDetailView(item: item)) {
                                    ItemCardView(item: item)
                                        .padding(.horizontal)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    // From Friends Section
                    let filteredFromFriends = filterItems(feed.fromFriends)
                    if !filteredFromFriends.isEmpty {
                        SectionView(title: "From Friends") {
                            ForEach(filteredFromFriends) { item in
                                NavigationLink(destination: ItemDetailView(item: item)) {
                                    ItemCardView(item: item)
                                        .padding(.horizontal)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    // By You Section
                    let filteredByYou = filterItems(feed.byYou)
                    if !filteredByYou.isEmpty {
                        SectionView(title: "Saved by You") {
                            ForEach(filteredByYou) { item in
                                NavigationLink(destination: ItemDetailView(item: item)) {
                                    ItemCardView(item: item)
                                        .padding(.horizontal)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    // For You Section
                    let filteredForYou = filterItems(feed.forYou)
                    if !filteredForYou.isEmpty {
                        SectionView(title: "For You") {
                            ForEach(filteredForYou) { item in
                                NavigationLink(destination: ItemDetailView(item: item)) {
                                    ItemCardView(item: item)
                                        .padding(.horizontal)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    
                    // Empty state when filter has no results
                    if selectedFilter != nil && 
                       filteredBrainSnack.isEmpty && 
                       filteredFromFriends.isEmpty && 
                       filteredByYou.isEmpty && 
                       filteredForYou.isEmpty {
                        VStack(spacing: 12) {
                            Text("No \(selectedFilter?.displayName ?? "items") found")
                                .font(StashTypography.body)
                                .foregroundColor(StashTheme.Color.textSecondary)
                            
                            Button("Clear filter") {
                                selectedFilter = nil
                            }
                            .font(StashTypography.body.weight(.medium))
                            .foregroundColor(StashTheme.Color.accent)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                    }
                }
                .padding(.vertical)
            } else if viewModel.error != nil {
                EmptyStateView(
                    title: "Unable to load",
                    message: "There was a problem loading your feed. Pull to refresh.",
                    systemImage: "exclamationmark.triangle"
                )
            } else {
                EmptyStateView(
                    title: "Nothing here yet",
                    message: "Start saving interesting things to see them appear here",
                    systemImage: "tray"
                )
            }
        }
    }

    private func performSearch(query: String) async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            searchResults = []
            return
        }

        // Debounce: wait a bit before searching
        try? await Task.sleep(nanoseconds: 300_000_000) // 0.3 seconds

        // Check if query is still the same
        guard trimmed == searchText.trimmingCharacters(in: .whitespaces) else { return }

        isSearchLoading = true
        defer { isSearchLoading = false }

        do {
            searchResults = try await APIClient.shared.searchItems(query: trimmed)
        } catch {
            print("Search error: \(error)")
            searchResults = []
        }
    }
}

// MARK: - Search Bar View

struct SearchBarView: View {
    @Binding var text: String
    @Binding var isSearching: Bool
    let placeholder: String

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(StashTheme.Color.textMuted)

                TextField(placeholder, text: $text)
                    .font(StashTypography.body)
                    .foregroundColor(StashTheme.Color.textPrimary)
                    .focused($isFocused)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                if !text.isEmpty {
                    Button {
                        text = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(StashTheme.Color.textMuted)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(StashTheme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: StashTheme.Radius.tile)
                    .stroke(isFocused ? StashTheme.Color.accent : StashTheme.Color.borderSubtle, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: StashTheme.Radius.tile))

            if isSearching {
                Button("Cancel") {
                    text = ""
                    isSearching = false
                    isFocused = false
                }
                .font(StashTypography.body.weight(.medium))
                .foregroundColor(StashTheme.Color.accent)
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: isSearching)
        .onChange(of: isFocused) { _, newValue in
            withAnimation {
                isSearching = newValue || !text.isEmpty
            }
        }
    }
}

// MARK: - Search Results View

struct SearchResultsView: View {
    let results: [ItemSummary]
    let isLoading: Bool
    let query: String

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if isLoading {
                    HStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Searching...")
                            .font(StashTypography.caption)
                            .foregroundColor(StashTheme.Color.textMuted)
                    }
                    .padding(.top, 40)
                } else if results.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 40))
                            .foregroundColor(StashTheme.Color.textMuted)

                        Text("No results for \"\(query)\"")
                            .font(StashTypography.body)
                            .foregroundColor(StashTheme.Color.textSecondary)

                        Text("Try different keywords")
                            .font(StashTypography.caption)
                            .foregroundColor(StashTheme.Color.textMuted)
                    }
                    .padding(.top, 60)
                } else {
                    // Results count
                    HStack {
                        Text("\(results.count) result\(results.count == 1 ? "" : "s")")
                            .font(StashTypography.caption)
                            .foregroundColor(StashTheme.Color.textMuted)
                        Spacer()
                    }
                    .padding(.horizontal, StashSpacing.screenHorizontal)

                    // Results list
                    ForEach(results) { item in
                        NavigationLink(destination: ItemDetailView(item: item)) {
                            ItemCardView(item: item)
                                .padding(.horizontal, StashSpacing.screenHorizontal)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.vertical)
        }
    }
}

/// Section header view
struct SectionView<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(StashTypography.sectionTitle)
                .foregroundColor(StashTheme.Color.textPrimary)
                .padding(.horizontal, StashSpacing.screenHorizontal)

            content
        }
    }
}

#Preview {
    TodayView()
}
