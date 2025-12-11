import SwiftUI
import Combine

/// ViewModel for the Home feed
@MainActor
class HomeViewModel: ObservableObject {
    @Published var items: [ItemSummary] = []
    @Published var isLoading = false
    @Published var error: Error?
    @Published var selectedItemForChat: ItemSummary?
    
    private let apiClient = APIClient.shared
    
    func loadFeed() async {
        guard !isLoading else { return }

        isLoading = true
        error = nil

        do {
            // Load from existing feed-today endpoint
            let feed = try await apiClient.fetchTodayFeed()

            // Combine all items and deduplicate
            var allItems: [ItemSummary] = []
            var seenIds = Set<String>()

            // Priority order: brain_snack, from_friends, by_you, for_you
            for item in feed.brainSnack where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }
            for item in feed.fromFriends where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }
            for item in feed.byYou where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }
            for item in feed.forYou where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }

            withAnimation {
                self.items = allItems
            }
        } catch {
            self.error = error
            print("🔴 Failed to load feed: \(error)")

            // Keep existing items instead of falling back to mock data
            // This provides better UX - user sees stale data rather than mock/empty
            print("ℹ️  Keeping existing feed data (\(items.count) items)")
        }

        isLoading = false
    }
}
