import Foundation
import SwiftUI
import Combine

/// Notification names for item actions
extension Notification.Name {
    static let itemDeleted = Notification.Name("itemDeleted")
    static let itemLiked = Notification.Name("itemLiked")
    static let itemUnliked = Notification.Name("itemUnliked")
    static let itemMarkedDone = Notification.Name("itemMarkedDone")
    static let itemMarkedUndone = Notification.Name("itemMarkedUndone")
}

/// Manages item actions with optimistic updates
/// Use this to perform actions that should update UI immediately
@MainActor
class ItemActionsManager: ObservableObject {
    static let shared = ItemActionsManager()
    
    private let apiClient = APIClient.shared
    
    /// Tracks items currently being processed (to prevent double-taps)
    @Published var processingItems: Set<String> = []
    
    /// Tracks any errors that occurred
    @Published var lastError: Error?
    
    private init() {}
    
    // MARK: - Like Actions
    
    /// Like an item with optimistic update
    /// - Parameters:
    ///   - itemId: The item to like
    ///   - onOptimisticUpdate: Called immediately to update local state
    ///   - onRollback: Called if the API call fails
    func likeItem(
        itemId: String,
        onOptimisticUpdate: (() -> Void)? = nil,
        onRollback: (() -> Void)? = nil
    ) async {
        guard !processingItems.contains(itemId) else { return }
        processingItems.insert(itemId)
        
        // Optimistic update - update UI immediately
        onOptimisticUpdate?()
        NotificationCenter.default.post(name: .itemLiked, object: itemId)
        
        do {
            try await apiClient.likeItem(itemId: itemId)
            print("🟢 Item liked successfully: \(itemId)")
        } catch {
            print("🔴 Error liking item: \(error)")
            lastError = error
            // Rollback on failure
            onRollback?()
            NotificationCenter.default.post(name: .itemUnliked, object: itemId)
        }
        
        processingItems.remove(itemId)
    }
    
    /// Unlike an item with optimistic update
    func unlikeItem(
        itemId: String,
        onOptimisticUpdate: (() -> Void)? = nil,
        onRollback: (() -> Void)? = nil
    ) async {
        guard !processingItems.contains(itemId) else { return }
        processingItems.insert(itemId)
        
        // Optimistic update
        onOptimisticUpdate?()
        NotificationCenter.default.post(name: .itemUnliked, object: itemId)
        
        do {
            try await apiClient.unlikeItem(itemId: itemId)
            print("🟢 Item unliked successfully: \(itemId)")
        } catch {
            print("🔴 Error unliking item: \(error)")
            lastError = error
            // Rollback on failure
            onRollback?()
            NotificationCenter.default.post(name: .itemLiked, object: itemId)
        }
        
        processingItems.remove(itemId)
    }
    
    // MARK: - Done Actions
    
    /// Mark an item as done with optimistic update
    func markItemDone(
        itemId: String,
        onOptimisticUpdate: (() -> Void)? = nil,
        onRollback: (() -> Void)? = nil
    ) async {
        guard !processingItems.contains(itemId) else { return }
        processingItems.insert(itemId)
        
        // Optimistic update
        onOptimisticUpdate?()
        NotificationCenter.default.post(name: .itemMarkedDone, object: itemId)
        
        do {
            try await apiClient.markItemDone(itemId: itemId)
            print("🟢 Item marked done: \(itemId)")
        } catch {
            print("🔴 Error marking item done: \(error)")
            lastError = error
            // Rollback on failure
            onRollback?()
            NotificationCenter.default.post(name: .itemMarkedUndone, object: itemId)
        }
        
        processingItems.remove(itemId)
    }
    
    /// Mark an item as not done with optimistic update
    func markItemUndone(
        itemId: String,
        onOptimisticUpdate: (() -> Void)? = nil,
        onRollback: (() -> Void)? = nil
    ) async {
        guard !processingItems.contains(itemId) else { return }
        processingItems.insert(itemId)
        
        // Optimistic update
        onOptimisticUpdate?()
        NotificationCenter.default.post(name: .itemMarkedUndone, object: itemId)
        
        do {
            try await apiClient.markItemUndone(itemId: itemId)
            print("🟢 Item marked undone: \(itemId)")
        } catch {
            print("🔴 Error marking item undone: \(error)")
            lastError = error
            // Rollback on failure
            onRollback?()
            NotificationCenter.default.post(name: .itemMarkedDone, object: itemId)
        }
        
        processingItems.remove(itemId)
    }
    
    // MARK: - Delete Actions
    
    /// Delete an item with optimistic update
    /// Note: This one is more critical - we dismiss first, then try to delete
    func deleteItem(
        itemId: String,
        onOptimisticUpdate: (() -> Void)? = nil,
        onError: ((Error) -> Void)? = nil
    ) async {
        guard !processingItems.contains(itemId) else { return }
        processingItems.insert(itemId)
        
        // Optimistic update - remove from UI immediately
        onOptimisticUpdate?()
        NotificationCenter.default.post(name: .itemDeleted, object: itemId)
        
        do {
            try await apiClient.deleteItem(itemId: itemId)
            print("🟢 Item deleted: \(itemId)")
        } catch {
            print("🔴 Error deleting item: \(error)")
            lastError = error
            // For delete, we typically don't rollback since user already navigated away
            // But we notify of the error
            onError?(error)
        }
        
        processingItems.remove(itemId)
    }
    
    // MARK: - Tracking Actions (non-optimistic, fire-and-forget)
    
    /// Track item engagement (doesn't need optimistic update)
    func trackEngagement(itemId: String, action: String) {
        Task {
            do {
                try await apiClient.trackItemEngagement(itemId: itemId, action: action)
            } catch {
                print("🔴 Error tracking engagement: \(error)")
                // Non-critical, don't show error to user
            }
        }
    }
    
    /// Mark item as opened
    func markOpened(itemId: String) {
        Task {
            do {
                try await apiClient.markItemOpened(itemId: itemId)
            } catch {
                print("🔴 Error marking item opened: \(error)")
            }
        }
    }
}
