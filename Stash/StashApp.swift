//
//  StashApp.swift
//  Stash
//
//  Created by Avital, Nadav on 11/26/25.
//

import SwiftUI

@main
struct StashApp: App {
    @StateObject private var authManager = AuthManager.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if authManager.isCheckingAuth {
                    // Show loading while checking auth state
                    ZStack {
                        StashTheme.Color.bg
                            .ignoresSafeArea()
                        ProgressView()
                            .tint(StashTheme.Color.accent)
                    }
                } else if authManager.isAuthenticated {
                    if authManager.needsHandleSetup {
                        // User is authenticated but needs to set up handle
                        HandleSetupView()
                    } else if authManager.needsInterestsOnboarding {
                        // User has handle but hasn't set up interests
                        InterestsOnboardingView()
                    } else {
                        // User is fully set up, show main app
                        MainTabView()
                    }
                } else {
                    // User is not authenticated, show auth screen
                    AuthView()
                }
            }
        }
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .active {
                // App became active - check for pending URLs from Share Extension
                processPendingURLs()
            }
        }
    }

    /// Process URLs saved by Share Extension
    private func processPendingURLs() {
        let pendingItems = SharedAuthManager.getPendingURLs()
        guard !pendingItems.isEmpty else { return }

        print("🔵 App: Found \(pendingItems.count) pending item(s) from Share Extension")

        Task {
            let apiClient = APIClient.shared
            var successCount = 0

            for item in pendingItems {
                guard let urlString = item["url"],
                      let sourceString = item["source"] else {
                    print("❌ App: Invalid pending item format")
                    continue
                }

                print("🔵 App: Processing pending URL: \(urlString) with source: \(sourceString)")

                // For now, save all items to user's stash
                // The "friend" source just indicates user wants to share it
                // They can use the "Share with Friend" button in the detail view
                do {
                    let response = try await apiClient.createItem(url: urlString, source: .self)
                    print("✅ App: Successfully saved item \(response.itemId)")
                    successCount += 1

                    if sourceString == "friend" {
                        print("🔵 App: Item marked for sharing with friend")
                        // Could store itemId for auto-opening share sheet
                        SharedAuthManager.savePendingShare(itemId: response.itemId)
                    }
                } catch {
                    print("❌ App: Failed to save URL: \(error.localizedDescription)")
                }
            }

            SharedAuthManager.clearPendingURLs()
            print("✅ App: Cleared pending URLs")

            // Refresh feed if any items were successfully saved
            if successCount > 0 {
                print("🔵 App: Refreshing feed to show new items...")
                NotificationCenter.default.post(name: NSNotification.Name("RefreshFeed"), object: nil)
            }
        }
    }
}
