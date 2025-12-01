import Foundation

/// In-memory cache for API responses with TTL (time-to-live) support
actor APICache {
    static let shared = APICache()
    
    private struct CacheEntry<T> {
        let value: T
        let timestamp: Date
        let ttl: TimeInterval
        
        var isExpired: Bool {
            Date().timeIntervalSince(timestamp) > ttl
        }
    }
    
    // Cache storage with type-erased entries
    private var cache: [String: Any] = [:]
    
    // Default TTL values for different cache types
    enum CacheTTL {
        static let todayFeed: TimeInterval = 60 // 1 minute - refreshes frequently
        static let profile: TimeInterval = 300 // 5 minutes
        static let searchResults: TimeInterval = 120 // 2 minutes
        static let friends: TimeInterval = 180 // 3 minutes
    }
    
    private init() {}
    
    // MARK: - Generic Cache Operations
    
    func get<T>(_ key: String) -> T? {
        guard let entry = cache[key] as? CacheEntry<T> else {
            return nil
        }
        
        if entry.isExpired {
            cache.removeValue(forKey: key)
            return nil
        }
        
        return entry.value
    }
    
    func set<T>(_ key: String, value: T, ttl: TimeInterval) {
        let entry = CacheEntry(value: value, timestamp: Date(), ttl: ttl)
        cache[key] = entry
    }
    
    func invalidate(_ key: String) {
        cache.removeValue(forKey: key)
    }
    
    func invalidateAll() {
        cache.removeAll()
    }
    
    func invalidateMatching(prefix: String) {
        let keysToRemove = cache.keys.filter { $0.hasPrefix(prefix) }
        for key in keysToRemove {
            cache.removeValue(forKey: key)
        }
    }
    
    // MARK: - Convenience Keys
    
    enum CacheKey {
        static let todayFeed = "today_feed"
        static let profile = "profile"
        static let friends = "friends"
        
        static func search(query: String) -> String {
            "search_\(query.lowercased())"
        }
    }
}
