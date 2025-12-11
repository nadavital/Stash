import Foundation
import Supabase
import Combine

/// Main API client for Stash backend endpoints
@MainActor
class APIClient: ObservableObject {
    /// Shared instance
    static let shared = APIClient()

    private let supabase = SupabaseClientManager.shared.client
    private let cache = APICache.shared

    /// Flag to use mock data for development (set to false when backend is ready)
    var useMockData = false

    private init() {}
    
    // MARK: - Cache Management
    
    /// Clear all cached data
    func clearCache() async {
        await cache.invalidateAll()
    }
    
    /// Invalidate feed cache (call after creating/deleting items)
    func invalidateFeedCache() async {
        await cache.invalidate(APICache.CacheKey.todayFeed)
    }
    
    /// Invalidate profile cache (call after profile changes)
    func invalidateProfileCache() async {
        await cache.invalidate(APICache.CacheKey.profile)
    }

    // MARK: - Today Feed

    /// Fetch the Today feed for the current user
    /// - Parameter forceRefresh: If true, bypasses cache and fetches fresh data
    func fetchTodayFeed(forceRefresh: Bool = false) async throws -> TodayFeed {
        if useMockData {
            // Simulate network delay
            try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
            return .mock
        }
        
        // Check cache first (unless force refreshing)
        if !forceRefresh, let cached: TodayFeed = await cache.get(APICache.CacheKey.todayFeed) {
            print("🟢 Feed loaded from cache")
            return cached
        }

        // Real API call to Supabase Edge Function
        do {
            print("🔵 Calling feed-today function...")

            // Call the function and get TodayFeed directly
            let feed: TodayFeed = try await supabase.functions.invoke(
                "feed-today",
                options: FunctionInvokeOptions(method: .get)
            )

            // Cache the result
            await cache.set(APICache.CacheKey.todayFeed, value: feed, ttl: APICache.CacheTTL.todayFeed)
            
            print("🟢 Feed loaded and cached")
            return feed
        } catch {
            print("🔴 Feed error: \(error)")
            throw APIError.networkError(error)
        }
    }

    // MARK: - Chat

    /// A message in the conversation history
    struct ConversationMessage: Encodable {
        let role: String
        let content: String
    }

    /// Send a message to chat with the user's stash
    /// - Parameters:
    ///   - message: The user's message/question
    ///   - focusedItemId: Optional item ID if the user is viewing a specific item
    ///   - conversationHistory: Previous messages in the conversation for context
    func chatWithStash(message: String, focusedItemId: String? = nil, conversationHistory: [ConversationMessage] = []) async throws -> ChatResponse {
        if useMockData {
            // Simulate network delay
            try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            return ChatResponse(
                answer: "Based on what you've saved, I'd recommend checking out \"\(ItemSummary.mockArticle.title)\". It aligns with your interest in AI and development.",
                referencedItems: [ItemSummary.mockArticle]
            )
        }

        // Real API call
        do {
            print("🔵 Calling chat-with-stash function with message: \(message), focusedItemId: \(focusedItemId ?? "none"), history: \(conversationHistory.count) messages")

            struct ChatPayload: Encodable {
                let message: String
                let focusedItemId: String?
                let conversationHistory: [ConversationMessage]
                
                enum CodingKeys: String, CodingKey {
                    case message
                    case focusedItemId = "focusedItemId"
                    case conversationHistory = "conversationHistory"
                }
            }
            
            let payload = ChatPayload(message: message, focusedItemId: focusedItemId, conversationHistory: conversationHistory)

            let response: ChatResponse = try await supabase.functions.invoke(
                "chat-with-stash",
                options: FunctionInvokeOptions(body: payload)
            )

            print("🟢 Chat response received: \(response.answer)")
            return response
        } catch {
            print("🔴 Chat error: \(error)")
            throw APIError.networkError(error)
        }
    }

    // MARK: - Items

    /// Create a new stash item from a URL
    func createItem(url: String, source: ItemSource = .self, note: String? = nil) async throws -> CreateItemResponse {
        if useMockData {
            // Simulate network delay
            try await Task.sleep(nanoseconds: 800_000_000) // 0.8 seconds
            return CreateItemResponse(
                itemId: UUID().uuidString,
                status: "queued",
                entityId: nil,
                title: nil
            )
        }

        // Real API call
        do {
            let startTime = Date()
            let sanitizedURL = url.count > 100 ? "\(url.prefix(100))..." : url
            print("🔵 [APIClient] Calling create-item with URL: \(sanitizedURL), source: \(source.rawValue)")

            struct CreateItemPayload: Encodable {
                let url: String
                let source: String
                let note: String?
            }

            let payload = CreateItemPayload(
                url: url,
                source: source.rawValue,
                note: note
            )

            let response: CreateItemResponse = try await supabase.functions.invoke(
                "create-item",
                options: FunctionInvokeOptions(body: payload)
            )

            let duration = Date().timeIntervalSince(startTime)

            // Invalidate feed cache since we added a new item
            await invalidateFeedCache()
            // Invalidate profile cache since stats changed
            await invalidateProfileCache()

            print("🟢 [APIClient] Item created successfully - ID: \(response.itemId), Status: \(response.status), Entity ID: \(response.entityId ?? "nil"), Duration: \(String(format: "%.2f", duration))s")
            print("🗑️  [APIClient] Invalidated feed and profile caches")

            return response
        } catch {
            print("🔴 [APIClient] Create item failed - Error: \(error)")
            print("🔴 [APIClient] Error type: \(type(of: error))")
            if let urlError = error as? URLError {
                print("🔴 [APIClient] URLError code: \(urlError.code.rawValue)")
            }
            throw APIError.networkError(error)
        }
    }

    /// Create a new stash item from an image (screenshot analysis)
    func createItemFromImage(imageData: Data, source: ItemSource = .self, note: String? = nil) async throws -> CreateItemResponse {
        if useMockData {
            // Simulate network delay
            try await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds (image analysis takes longer)
            return CreateItemResponse(
                itemId: UUID().uuidString,
                status: "queued",
                entityId: nil,
                title: nil
            )
        }

        // Real API call
        do {
            let startTime = Date()
            let imageSizeMB = Double(imageData.count) / 1_048_576
            print("📸 [APIClient] Calling create-item with image - Size: \(String(format: "%.2f", imageSizeMB))MB, source: \(source.rawValue)")

            struct CreateItemFromImagePayload: Encodable {
                let imageBase64: String
                let source: String
                let note: String?
            }

            let base64 = imageData.base64EncodedString()
            print("🔄 [APIClient] Encoded image to base64 - Length: \(base64.count) characters")

            let payload = CreateItemFromImagePayload(
                imageBase64: base64,
                source: source.rawValue,
                note: note
            )

            let response: CreateItemResponse = try await supabase.functions.invoke(
                "create-item",
                options: FunctionInvokeOptions(body: payload)
            )

            let duration = Date().timeIntervalSince(startTime)

            // Invalidate feed cache since we added a new item
            await invalidateFeedCache()
            // Invalidate profile cache since stats changed
            await invalidateProfileCache()

            print("🟢 [APIClient] Image item created successfully - ID: \(response.itemId), Status: \(response.status), Entity ID: \(response.entityId ?? "nil"), Duration: \(String(format: "%.2f", duration))s")
            print("🗑️  [APIClient] Invalidated feed and profile caches")

            return response
        } catch {
            print("🔴 [APIClient] Create image item failed - Error: \(error)")
            print("🔴 [APIClient] Error type: \(type(of: error))")
            throw APIError.networkError(error)
        }
    }

    // MARK: - Profile

    /// Fetch profile overview for the current user
    /// - Parameter forceRefresh: If true, bypasses cache and fetches fresh data
    func fetchProfileOverview(forceRefresh: Bool = false) async throws -> ProfileOverview {
        if useMockData {
            // Simulate network delay
            try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds
            return .mock
        }
        
        // Check cache first (unless force refreshing)
        if !forceRefresh, let cached: ProfileOverview = await cache.get(APICache.CacheKey.profile) {
            print("🟢 Profile loaded from cache")
            return cached
        }

        // Real API call
        do {
            print("🔵 Calling profile-overview function...")

            let profile: ProfileOverview = try await supabase.functions.invoke(
                "profile-overview",
                options: FunctionInvokeOptions(method: .get)
            )

            // Cache the result
            await cache.set(APICache.CacheKey.profile, value: profile, ttl: APICache.CacheTTL.profile)
            
            print("🟢 Profile loaded and cached")
            return profile
        } catch {
            print("🔴 Profile error: \(error)")
            throw APIError.networkError(error)
        }
    }

    // MARK: - Item Actions

    /// Perform an action on an item
    private func performItemAction(itemId: String, action: String) async throws {
        struct ActionPayload: Encodable {
            let item_id: String
            let action: String
        }

        let payload = ActionPayload(item_id: itemId, action: action)

        let _: EmptyResponse = try await supabase.functions.invoke(
            "item-actions",
            options: FunctionInvokeOptions(body: payload)
        )
    }

    /// Delete an item
    func deleteItem(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "delete")
        // Invalidate feed cache since item list changed
        await invalidateFeedCache()
    }

    /// Mark an item as liked
    func likeItem(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "like")
    }

    /// Unlike an item
    func unlikeItem(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "unlike")
    }

    /// Dislike an item (negative taste signal)
    func dislikeItem(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "dislike")
    }

    /// Mark an item as done
    func markItemDone(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "done")
        // Invalidate feed cache since item status changed
        await invalidateFeedCache()
    }

    /// Mark an item as not done
    func markItemUndone(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "undone")
        // Invalidate feed cache since item status changed
        await invalidateFeedCache()
    }

    /// Mark an item as opened
    func markItemOpened(itemId: String) async throws {
        try await performItemAction(itemId: itemId, action: "open")
    }

    /// Track item engagement (read, play, view, etc.)
    func trackItemEngagement(itemId: String, action: String) async throws {
        // Uses the same item-actions endpoint
        try await performItemAction(itemId: itemId, action: action)
    }

    // MARK: - Friends

    /// Get list of friends
    /// - Parameter forceRefresh: If true, bypasses cache and fetches fresh data
    func getFriends(forceRefresh: Bool = false) async throws -> [Friend] {
        // Check cache first (unless force refreshing)
        if !forceRefresh, let cached: [Friend] = await cache.get(APICache.CacheKey.friends) {
            print("🟢 Friends loaded from cache")
            return cached
        }
        
        struct FriendsResponse: Codable {
            let friends: [Friend]
        }

        let response: FriendsResponse = try await supabase.functions.invoke(
            "friends",
            options: FunctionInvokeOptions(method: .get)
        )
        
        // Cache the result
        await cache.set(APICache.CacheKey.friends, value: response.friends, ttl: APICache.CacheTTL.friends)

        return response.friends
    }

    /// Add a friend by handle
    func addFriend(handle: String) async throws -> Friend {
        struct AddFriendPayload: Encodable {
            let friend_handle: String
        }

        struct AddFriendResponse: Codable {
            let friend: Friend
        }

        let payload = AddFriendPayload(friend_handle: handle)

        let response: AddFriendResponse = try await supabase.functions.invoke(
            "friends",
            options: FunctionInvokeOptions(body: payload)
        )
        
        // Invalidate friends cache
        await cache.invalidate(APICache.CacheKey.friends)

        return response.friend
    }

    /// Remove a friend
    func removeFriend(friendId: String) async throws {
        struct RemoveFriendPayload: Encodable {
            let friend_id: String
        }

        let payload = RemoveFriendPayload(friend_id: friendId)

        let _: EmptyResponse = try await supabase.functions.invoke(
            "friends",
            options: FunctionInvokeOptions(body: payload)
        )
        
        // Invalidate friends cache
        await cache.invalidate(APICache.CacheKey.friends)
    }

    /// Share an item with a friend
    func shareItem(itemId: String, friendId: String, note: String? = nil) async throws {
        struct ShareItemPayload: Encodable {
            let item_id: String
            let friend_id: String
            let note: String?
        }

        let payload = ShareItemPayload(item_id: itemId, friend_id: friendId, note: note)

        let _: EmptyResponse = try await supabase.functions.invoke(
            "share-item",
            options: FunctionInvokeOptions(body: payload)
        )
    }

    // MARK: - Search

    /// Search items in the user's stash
    func searchItems(query: String, limit: Int = 20) async throws -> [ItemSummary] {
        if useMockData {
            // Simulate network delay
            try await Task.sleep(nanoseconds: 300_000_000) // 0.3 seconds
            return ItemSummary.mockItems
                .filter { $0.title.localizedCaseInsensitiveContains(query) }
        }

        // Real API call
        do {
            print("🔵 Calling search-items function with query: \(query)")

            struct SearchPayload: Encodable {
                let query: String
                let limit: Int
            }

            struct SearchResponse: Codable {
                let results: [ItemSummary]
                let total: Int
                let query: String
            }

            let payload = SearchPayload(query: query, limit: limit)

            let response: SearchResponse = try await supabase.functions.invoke(
                "search-items",
                options: FunctionInvokeOptions(body: payload)
            )

            print("🟢 Search returned \(response.total) results")
            return response.results
        } catch {
            print("🔴 Search error: \(error)")
            throw APIError.networkError(error)
        }
    }
    
    // MARK: - Onboarding
    
    /// Parse user's interests during onboarding
    func parseInterests(interests: String) async throws {
        // Real API call
        do {
            print("🔵 Calling parse-interests function with: \(interests)")
            
            struct ParseInterestsPayload: Encodable {
                let interests: String
            }
            
            struct ParseInterestsResponse: Codable {
                let success: Bool
            }
            
            let payload = ParseInterestsPayload(interests: interests)
            
            let _: ParseInterestsResponse = try await supabase.functions.invoke(
                "parse-interests",
                options: FunctionInvokeOptions(body: payload)
            )
            
            print("🟢 Interests parsed and saved")
        } catch let error as FunctionsError {
            // Try to extract more details from the FunctionsError
            switch error {
            case .httpError(let code, let data):
                let responseBody = String(data: data, encoding: .utf8) ?? "Unable to decode"
                print("🔴 Parse interests HTTP error \(code): \(responseBody)")
            case .relayError:
                print("🔴 Parse interests relay error")
            }
            throw APIError.networkError(error)
        } catch {
            print("🔴 Parse interests error: \(error)")
            throw APIError.networkError(error)
        }
    }
}

// MARK: - Response Types

struct CreateItemResponse: Codable {
    let itemId: String
    let status: String
    let entityId: String?
    let title: String?

    enum CodingKeys: String, CodingKey {
        case itemId = "item_id"
        case status
        case entityId = "entity_id"
        case title
    }
}

struct EmptyResponse: Codable {
    let success: Bool?
}

struct Friend: Codable, Identifiable {
    let userId: String
    let handle: String
    let name: String?
    let tasteSimilarity: TasteSimilarity?

    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case handle
        case name
        case tasteSimilarity = "taste_similarity"
    }
    
    struct TasteSimilarity: Codable {
        let similarityScore: Double?
        let commonInterests: [String]?
        
        enum CodingKeys: String, CodingKey {
            case similarityScore = "similarity_score"
            case commonInterests = "common_interests"
        }
    }
}

// MARK: - Errors

enum APIError: LocalizedError {
    case notImplemented
    case invalidURL
    case unauthorized
    case networkError(Error)
    case decodingError(Error)
    case unknown

    var errorDescription: String? {
        switch self {
        case .notImplemented:
            return "This feature is not yet implemented. Using mock data for now."
        case .invalidURL:
            return "The URL provided is invalid."
        case .unauthorized:
            return "You need to sign in to continue."
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Data parsing error: \(error.localizedDescription)"
        case .unknown:
            return "An unknown error occurred."
        }
    }
}
