import SwiftUI
import Combine

/// ViewModel for the You tab
@MainActor
class YouViewModel: ObservableObject {
    @Published var items: [ItemSummary] = []
    @Published var friends: [Friend] = []
    @Published var isLoading = false
    @Published var error: Error?
    
    private let apiClient = APIClient.shared
    
    // Computed property: group items by status/category
    var queueItems: [ItemSummary] {
        // For now, return all items as queue
        // TODO: Filter by status when available
        items
    }
    
    func load() async {
        guard !isLoading else { return }
        
        isLoading = true
        error = nil
        
        // Load in parallel
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadItems() }
            group.addTask { await self.loadFriends() }
        }
        
        isLoading = false
    }
    
    private func loadItems() async {
        do {
            // Use the feed endpoint to get all user items
            let feed = try await apiClient.fetchTodayFeed()
            
            // Combine all items
            var allItems: [ItemSummary] = []
            var seenIds = Set<String>()
            
            for item in feed.byYou where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }
            for item in feed.brainSnack where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }
            for item in feed.forYou where !seenIds.contains(item.id) {
                allItems.append(item)
                seenIds.insert(item.id)
            }
            
            await MainActor.run {
                self.items = allItems
            }
        } catch {
            print("🔴 Failed to load items: \(error)")
            self.error = error
        }
    }
    
    private func loadFriends() async {
        do {
            let friends = try await apiClient.getFriends()
            await MainActor.run {
                self.friends = friends
            }
        } catch {
            print("🔴 Failed to load friends: \(error)")
            // Don't set error - friends failing shouldn't block the whole view
        }
    }
}
