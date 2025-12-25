import SwiftUI

/// Temporary debug ViewModel for managing stash items during development
@Observable
@MainActor
class DebugViewModel {
    var allItems: [ItemSummary] = []
    var isLoading = false
    var error: Error?

    private let apiClient = APIClient.shared

    /// Callback to notify when items are refreshed (so HomeViewModel can reload)
    var onRefresh: (() async -> Void)?

    /// Load all items from the user's stash (directly from database)
    func loadAllItems() async {
        guard !isLoading else { return }

        isLoading = true
        error = nil

        do {
            // Fetch ALL items directly from database (not just feed)
            allItems = try await apiClient.fetchAllItems(limit: 200)
            print("🔍 [Debug] Loaded \(allItems.count) total items")
        } catch {
            self.error = error
            print("🔴 [Debug] Failed to load items: \(error)")
        }

        isLoading = false
    }

    /// Refresh both debug view and home feed
    func refresh() async {
        await loadAllItems()
        await onRefresh?()
    }

    /// Delete a specific item
    func deleteItem(_ item: ItemSummary) async {
        do {
            try await apiClient.deleteItem(itemId: item.itemId)

            // Remove from local array
            allItems.removeAll { $0.itemId == item.itemId }

            print("✅ [Debug] Deleted item: \(item.title)")
        } catch {
            print("🔴 [Debug] Failed to delete item: \(error)")
            self.error = error
        }
    }

    /// Delete all items (use with caution!)
    func deleteAllItems() async {
        for item in allItems {
            await deleteItem(item)
        }
    }
}
