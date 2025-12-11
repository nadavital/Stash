import SwiftUI

/// Main tab bar container with 2 tabs + search role
/// Architecture: Home | You | Search (via Tab role)
struct MainTabView: View {
    enum TabSelection: Hashable {
        case home
        case you
        case search
    }

    @State private var selectedTab: TabSelection = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            // Home Tab - Immersive content feed
            Tab(value: .home) {
                HomeView()
            } label: {
                Label("Home", systemImage: "house.fill")
            }

            // You Tab - Library, Shared With You, Friends (replaces Profile)
            Tab(value: .you) {
                YouView()
            } label: {
                Label("You", systemImage: "person.fill")
            }

            // Search Tab - AI-powered search with custom Stash glyph icon
            Tab(value: .search, role: .search) {
                SearchView()
            } label: {
                Label("Search", image: "stash-glyph-tab")
            }
        }
        .tint(StashTheme.Color.accent)
    }
}

#Preview {
    MainTabView()
}
