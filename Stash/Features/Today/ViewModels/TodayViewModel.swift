import Foundation
import SwiftUI
import Combine

/// ViewModel for the Today feed
@MainActor
class TodayViewModel: ObservableObject {
    @Published var feed: TodayFeed?
    @Published var isLoading = false
    @Published var error: Error?

    private let apiClient = APIClient.shared

    /// Fetch the today feed (uses cache if available)
    func fetchFeed() async {
        isLoading = true
        error = nil

        do {
            print("🔵 Fetching today feed...")
            feed = try await apiClient.fetchTodayFeed()
            print("🟢 Feed loaded successfully")
        } catch {
            print("🔴 Error loading feed: \(error)")
            print("🔴 Error type: \(type(of: error))")
            self.error = error
        }

        isLoading = false
    }

    /// Refresh the feed (for pull-to-refresh, bypasses cache)
    func refresh() async {
        isLoading = true
        error = nil

        do {
            print("🔵 Force refreshing today feed...")
            feed = try await apiClient.fetchTodayFeed(forceRefresh: true)
            print("🟢 Feed refreshed successfully")
        } catch {
            print("🔴 Error refreshing feed: \(error)")
            self.error = error
        }

        isLoading = false
    }
    
    /// Remove an item from the local feed (optimistic update)
    func removeItem(itemId: String) {
        guard var currentFeed = feed else { return }
        
        // Remove from all sections
        currentFeed.brainSnack.removeAll { $0.itemId == itemId }
        currentFeed.fromFriends.removeAll { $0.itemId == itemId }
        currentFeed.byYou.removeAll { $0.itemId == itemId }
        currentFeed.forYou.removeAll { $0.itemId == itemId }
        
        feed = currentFeed
    }
}
