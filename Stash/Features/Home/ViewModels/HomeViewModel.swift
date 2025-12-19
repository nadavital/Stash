import SwiftUI

/// ViewModel for the Home feed
@Observable
@MainActor
class HomeViewModel {
    var items: [ItemSummary] = []
    var isLoading = false
    var error: Error?
    var selectedItemForChat: ItemSummary?

    private let apiClient = APIClient.shared
    
    func loadFeed() async {
        guard !isLoading else {
            print("⚠️ Feed load already in progress, skipping")
            return
        }

        print("🔵 [HomeViewModel] Starting feed load...")
        isLoading = true
        error = nil

        do {
            // Load from existing feed-today endpoint
            print("🔵 [HomeViewModel] Calling fetchTodayFeed...")
            let feed = try await apiClient.fetchTodayFeed()

            print("🔵 [HomeViewModel] Received feed sections:")
            print("  - Brain Snack: \(feed.brainSnack.count) items")
            print("  - From Friends: \(feed.fromFriends.count) items")
            print("  - By You: \(feed.byYou.count) items")
            print("  - For You: \(feed.forYou.count) items")

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

            print("🟢 [HomeViewModel] Combined \(allItems.count) total items after deduplication")

            withAnimation {
                self.items = allItems
            }

            print("🟢 [HomeViewModel] Feed load complete!")
        } catch {
            self.error = error
            print("🔴 [HomeViewModel] Failed to load feed: \(error)")
            print("🔴 [HomeViewModel] Error details: \(String(describing: error))")

            // Keep existing items instead of falling back to mock data
            // This provides better UX - user sees stale data rather than mock/empty
            print("ℹ️  [HomeViewModel] Keeping existing feed data (\(items.count) items)")
        }

        isLoading = false
        print("🔵 [HomeViewModel] Feed load finished (isLoading = false, items.count = \(items.count))")
    }
}
