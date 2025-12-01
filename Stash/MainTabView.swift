import SwiftUI

/// Main tab bar container with 4 tabs: Today, Brain, Friends, Profile
struct MainTabView: View {
    @State private var selectedTab = 0
    @State private var brainPrefill: String? = nil
    @State private var brainFocusedItemId: String? = nil

    var body: some View {
        TabView(selection: $selectedTab) {
            // Today Tab
            TodayView()
                .tabItem {
                    Label("Today", systemImage: "sparkles")
                }
                .tag(0)

            // Brain Tab
            BrainView(prefillPrompt: brainPrefill, focusedItemId: brainFocusedItemId)
                .tabItem {
                    Label("Brain", systemImage: "brain.head.profile")
                }
                .tag(1)

            // Friends Tab
            FriendsView()
                .tabItem {
                    Label("Friends", systemImage: "person.2")
                }
                .tag(2)

            // Profile Tab
            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
                .tag(3)
        }
        .background(StashTheme.Color.bg)
        .accentColor(StashTheme.Color.accent)
        .onReceive(NotificationCenter.default.publisher(for: .askAboutItem)) { notification in
            if let prompt = notification.userInfo?["prompt"] as? String {
                brainPrefill = prompt
                brainFocusedItemId = notification.userInfo?["itemId"] as? String
                selectedTab = 1 // Switch to Brain tab
            }
        }
        .onChange(of: selectedTab) { _, newValue in
            // Clear prefill when navigating away from Brain tab
            if newValue != 1 {
                brainPrefill = nil
                brainFocusedItemId = nil
            }
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let askAboutItem = Notification.Name("askAboutItem")
}

#Preview {
    MainTabView()
}
