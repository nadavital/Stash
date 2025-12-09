import SwiftUI

/// Main tab bar container with 2 tabs + search role
/// Architecture: Home | You | Search (via Tab role)
struct MainTabView: View {
    
    var body: some View {
        TabView {
            // Home Tab - Immersive content feed
            Tab("Home", systemImage: "house.fill") {
                HomeView()
            }
            
            // You Tab - Library, Shared With You, Friends (replaces Profile)
            Tab("You", systemImage: "person.fill") {
                YouView()
            }
            
            // Search Tab - AI-powered search with custom Stash glyph icon
            Tab("Search", image: "stash-glyph-tab", role: .search) {
                SearchView()
            }
        }
        .tint(StashTheme.Color.accent)
    }
}

#Preview {
    MainTabView()
}
