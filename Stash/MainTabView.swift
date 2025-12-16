import SwiftUI

/// Main app container - just the Home tab
/// Everything else accessed via overlays/sheets
/// Chat accessed via floating AI orb, Profile via toolbar button
struct MainTabView: View {
    var body: some View {
        HomeView()
    }
}

#Preview {
    MainTabView()
}
