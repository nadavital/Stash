import SwiftUI

/// The main Home tab - an immersive vertical feed of saved content
/// Cards have variable height based on content, not TikTok-style paging
struct HomeView: View {
    @StateObject private var viewModel = HomeViewModel()
    @State private var showingSearch = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                StashTheme.Color.bg
                    .ignoresSafeArea()
                
                if viewModel.isLoading && viewModel.items.isEmpty {
                    // Loading state
                    ProgressView()
                        .progressViewStyle(.circular)
                        .scaleEffect(1.2)
                        .tint(StashTheme.Color.accent)
                } else if viewModel.items.isEmpty {
                    // Empty state
                    EmptyHomeView()
                } else {
                    // Variable-height card feed
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(spacing: Spacing.lg) {
                            ForEach(viewModel.items) { item in
                                ImmersiveCard(
                                    item: item,
                                    relatedItems: viewModel.items.filter { $0.id != item.id }
                                ) { selectedItem in
                                    // Ask Stash about this item
                                    viewModel.selectedItemForChat = selectedItem
                                    showingSearch = true
                                }
                            }
                        }
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.lg)
                    }
                }
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingSearch) {
                SearchView()
            }
        }
        .task {
            await viewModel.loadFeed()
        }
        .refreshable {
            await viewModel.loadFeed()
        }
    }
}

// MARK: - Empty State

struct EmptyHomeView: View {
    var body: some View {
        VStack(spacing: Spacing.lg) {
            Image(systemName: "tray")
                .font(.system(size: 56))
                .foregroundStyle(StashTheme.Color.textMuted)
            
            Text("Your feed is empty")
                .font(Typography.title2)
                .foregroundStyle(StashTheme.Color.textPrimary)
            
            Text("Save articles, music, recipes, and more\nto see them here")
                .font(Typography.body)
                .foregroundStyle(StashTheme.Color.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

// MARK: - Preview

#Preview {
    HomeView()
}
