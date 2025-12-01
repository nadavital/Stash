import Foundation
import SwiftUI
import Combine

/// ViewModel for the Profile tab
@MainActor
class ProfileViewModel: ObservableObject {
    @Published var profile: ProfileOverview?
    @Published var isLoading = false
    @Published var error: Error?

    private let apiClient = APIClient.shared
    private let authManager = AuthManager.shared

    /// Fetch profile overview (uses cache if available)
    func fetchProfile() async {
        isLoading = true
        error = nil

        do {
            print("🔵 ProfileViewModel: Fetching profile...")
            let fetchedProfile = try await apiClient.fetchProfileOverview()
            print("🟢 ProfileViewModel: Received profile: \(fetchedProfile)")
            profile = fetchedProfile
            print("🟢 ProfileViewModel: Profile set successfully")
        } catch {
            print("🔴 ProfileViewModel: Error: \(error)")
            self.error = error
        }

        isLoading = false
        print("🔵 ProfileViewModel: isLoading = false, profile = \(String(describing: profile))")
    }
    
    /// Refresh profile (for pull-to-refresh, bypasses cache)
    func refresh() async {
        isLoading = true
        error = nil

        do {
            print("🔵 ProfileViewModel: Force refreshing profile...")
            let fetchedProfile = try await apiClient.fetchProfileOverview(forceRefresh: true)
            profile = fetchedProfile
            print("🟢 ProfileViewModel: Profile refreshed successfully")
        } catch {
            print("🔴 ProfileViewModel: Refresh error: \(error)")
            self.error = error
        }

        isLoading = false
    }

    /// Sign out the current user
    func signOut() async {
        do {
            try await authManager.signOut()
            // Clear all caches on sign out
            await apiClient.clearCache()
        } catch {
            self.error = error
        }
    }
}
