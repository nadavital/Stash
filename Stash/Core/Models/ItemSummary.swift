import Foundation

/// Type-specific metadata extracted during enrichment
struct TypeMetadata: Codable, Hashable {
    // MARK: - Social Posts (tweet, threads, instagram)
    let authorName: String?
    let authorHandle: String?
    let authorAvatarUrl: String?
    let embedHtml: String?           // oEmbed HTML for rendering
    let mediaUrls: [String]?         // Images/videos in post
    let likeCount: Int?
    let repostCount: Int?
    let commentCount: Int?
    
    // MARK: - Video
    let videoId: String?             // YouTube ID, TikTok ID, etc.
    let videoPlatform: String?       // "youtube", "tiktok", "instagram"
    let thumbnailUrl: String?
    let durationSeconds: Int?
    
    // MARK: - Music
    let appleMusicId: String?
    let spotifyId: String?
    let artistName: String?
    let albumName: String?
    let albumArtUrl: String?
    let previewUrl: String?          // 30-sec preview
    let durationMs: Int?
    
    // MARK: - Events
    let venueName: String?
    let venueAddress: String?
    let latitude: Double?
    let longitude: Double?
    let startDate: Date?
    let endDate: Date?
    let ticketUrl: String?
    
    // MARK: - Recipe
    let ingredients: [String]?
    let steps: [String]?
    let prepTime: String?
    let cookTime: String?
    let servings: Int?
    
    enum CodingKeys: String, CodingKey {
        case authorName = "author_name"
        case authorHandle = "author_handle"
        case authorAvatarUrl = "author_avatar_url"
        case embedHtml = "embed_html"
        case mediaUrls = "media_urls"
        case likeCount = "like_count"
        case repostCount = "repost_count"
        case commentCount = "comment_count"
        case videoId = "video_id"
        case videoPlatform = "video_platform"
        case thumbnailUrl = "thumbnail_url"
        case durationSeconds = "duration_seconds"
        case appleMusicId = "apple_music_id"
        case spotifyId = "spotify_id"
        case artistName = "artist_name"
        case albumName = "album_name"
        case albumArtUrl = "album_art_url"
        case previewUrl = "preview_url"
        case durationMs = "duration_ms"
        case venueName = "venue_name"
        case venueAddress = "venue_address"
        case latitude, longitude
        case startDate = "start_date"
        case endDate = "end_date"
        case ticketUrl = "ticket_url"
        case ingredients, steps
        case prepTime = "prep_time"
        case cookTime = "cook_time"
        case servings
    }
    
    init(
        authorName: String? = nil,
        authorHandle: String? = nil,
        authorAvatarUrl: String? = nil,
        embedHtml: String? = nil,
        mediaUrls: [String]? = nil,
        likeCount: Int? = nil,
        repostCount: Int? = nil,
        commentCount: Int? = nil,
        videoId: String? = nil,
        videoPlatform: String? = nil,
        thumbnailUrl: String? = nil,
        durationSeconds: Int? = nil,
        appleMusicId: String? = nil,
        spotifyId: String? = nil,
        artistName: String? = nil,
        albumName: String? = nil,
        albumArtUrl: String? = nil,
        previewUrl: String? = nil,
        durationMs: Int? = nil,
        venueName: String? = nil,
        venueAddress: String? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil,
        startDate: Date? = nil,
        endDate: Date? = nil,
        ticketUrl: String? = nil,
        ingredients: [String]? = nil,
        steps: [String]? = nil,
        prepTime: String? = nil,
        cookTime: String? = nil,
        servings: Int? = nil
    ) {
        self.authorName = authorName
        self.authorHandle = authorHandle
        self.authorAvatarUrl = authorAvatarUrl
        self.embedHtml = embedHtml
        self.mediaUrls = mediaUrls
        self.likeCount = likeCount
        self.repostCount = repostCount
        self.commentCount = commentCount
        self.videoId = videoId
        self.videoPlatform = videoPlatform
        self.thumbnailUrl = thumbnailUrl
        self.durationSeconds = durationSeconds
        self.appleMusicId = appleMusicId
        self.spotifyId = spotifyId
        self.artistName = artistName
        self.albumName = albumName
        self.albumArtUrl = albumArtUrl
        self.previewUrl = previewUrl
        self.durationMs = durationMs
        self.venueName = venueName
        self.venueAddress = venueAddress
        self.latitude = latitude
        self.longitude = longitude
        self.startDate = startDate
        self.endDate = endDate
        self.ticketUrl = ticketUrl
        self.ingredients = ingredients
        self.steps = steps
        self.prepTime = prepTime
        self.cookTime = cookTime
        self.servings = servings
    }
}

/// Summary representation of a stash item, as returned by API endpoints
struct ItemSummary: Codable, Identifiable, Hashable {
    let itemId: String
    let entityId: String
    let title: String
    let type: EntityType
    let primaryEmoji: String
    let sourceLabel: String
    let summary: String
    let createdAt: Date
    let canonicalUrl: String?
    let metadata: Metadata
    let sharedByUser: SharedByUser?

    var id: String { itemId }

    /// Information about the friend who shared this item
    struct SharedByUser: Codable, Hashable {
        let userId: String
        let handle: String
        let name: String?
    }
    
    // Hashable conformance - use itemId as unique identifier
    func hash(into hasher: inout Hasher) {
        hasher.combine(itemId)
    }
    
    static func == (lhs: ItemSummary, rhs: ItemSummary) -> Bool {
        lhs.itemId == rhs.itemId
    }

    struct Metadata: Codable, Hashable {
        let sourceName: String?
        let iconUrl: String?
        let tags: [String]
        let suggestedPrompts: [String]?
        let typeMetadata: TypeMetadata?
        
        // MARK: - Convenience accessors (for backward compatibility)
        var authorName: String? { typeMetadata?.authorName }
        var authorHandle: String? { typeMetadata?.authorHandle }
        var authorAvatarUrl: String? { typeMetadata?.authorAvatarUrl }
        var embedHtml: String? { typeMetadata?.embedHtml }
        var mediaUrls: [String]? { typeMetadata?.mediaUrls }
        var likeCount: Int? { typeMetadata?.likeCount }
        var repostCount: Int? { typeMetadata?.repostCount }
        var commentCount: Int? { typeMetadata?.commentCount }
        var videoId: String? { typeMetadata?.videoId }
        var videoPlatform: String? { typeMetadata?.videoPlatform }
        var thumbnailUrl: String? { typeMetadata?.thumbnailUrl }
        var durationSeconds: Int? { typeMetadata?.durationSeconds }
        var appleMusicId: String? { typeMetadata?.appleMusicId }
        var spotifyId: String? { typeMetadata?.spotifyId }
        var artistName: String? { typeMetadata?.artistName }
        var albumName: String? { typeMetadata?.albumName }
        var albumArtUrl: String? { typeMetadata?.albumArtUrl }
        var previewUrl: String? { typeMetadata?.previewUrl }
        var durationMs: Int? { typeMetadata?.durationMs }
        var venueName: String? { typeMetadata?.venueName }
        var venueAddress: String? { typeMetadata?.venueAddress }
        var latitude: Double? { typeMetadata?.latitude }
        var longitude: Double? { typeMetadata?.longitude }
        var startDate: Date? { typeMetadata?.startDate }
        var endDate: Date? { typeMetadata?.endDate }
        var ticketUrl: String? { typeMetadata?.ticketUrl }
        var ingredients: [String]? { typeMetadata?.ingredients }
        var steps: [String]? { typeMetadata?.steps }
        var prepTime: String? { typeMetadata?.prepTime }
        var cookTime: String? { typeMetadata?.cookTime }
        var servings: Int? { typeMetadata?.servings }

        enum CodingKeys: String, CodingKey {
            case sourceName = "source_name"
            case iconUrl = "icon_url"
            case tags
            case suggestedPrompts = "suggested_prompts"
            case typeMetadata = "type_metadata"
        }
        
        init(
            sourceName: String? = nil,
            iconUrl: String? = nil,
            tags: [String] = [],
            suggestedPrompts: [String]? = nil,
            typeMetadata: TypeMetadata? = nil
        ) {
            self.sourceName = sourceName
            self.iconUrl = iconUrl
            self.tags = tags
            self.suggestedPrompts = suggestedPrompts
            self.typeMetadata = typeMetadata
        }
        
        // Convenience initializer with type-specific fields (for mock data)
        init(
            sourceName: String? = nil,
            iconUrl: String? = nil,
            tags: [String] = [],
            suggestedPrompts: [String]? = nil,
            // Social
            authorName: String? = nil,
            authorHandle: String? = nil,
            authorAvatarUrl: String? = nil,
            embedHtml: String? = nil,
            mediaUrls: [String]? = nil,
            likeCount: Int? = nil,
            repostCount: Int? = nil,
            commentCount: Int? = nil,
            // Video
            videoId: String? = nil,
            videoPlatform: String? = nil,
            thumbnailUrl: String? = nil,
            durationSeconds: Int? = nil,
            // Music
            appleMusicId: String? = nil,
            spotifyId: String? = nil,
            artistName: String? = nil,
            albumName: String? = nil,
            albumArtUrl: String? = nil,
            previewUrl: String? = nil,
            durationMs: Int? = nil,
            // Events
            venueName: String? = nil,
            venueAddress: String? = nil,
            latitude: Double? = nil,
            longitude: Double? = nil,
            startDate: Date? = nil,
            endDate: Date? = nil,
            ticketUrl: String? = nil,
            // Recipe
            ingredients: [String]? = nil,
            steps: [String]? = nil,
            prepTime: String? = nil,
            cookTime: String? = nil,
            servings: Int? = nil
        ) {
            self.sourceName = sourceName
            self.iconUrl = iconUrl
            self.tags = tags
            self.suggestedPrompts = suggestedPrompts
            
            // Only create typeMetadata if any type-specific field is provided
            let hasTypeSpecificData = authorName != nil || authorHandle != nil || videoId != nil ||
                                       appleMusicId != nil || spotifyId != nil || venueName != nil ||
                                       ingredients != nil || artistName != nil
            
            self.typeMetadata = hasTypeSpecificData ? TypeMetadata(
                authorName: authorName,
                authorHandle: authorHandle,
                authorAvatarUrl: authorAvatarUrl,
                embedHtml: embedHtml,
                mediaUrls: mediaUrls,
                likeCount: likeCount,
                repostCount: repostCount,
                commentCount: commentCount,
                videoId: videoId,
                videoPlatform: videoPlatform,
                thumbnailUrl: thumbnailUrl,
                durationSeconds: durationSeconds,
                appleMusicId: appleMusicId,
                spotifyId: spotifyId,
                artistName: artistName,
                albumName: albumName,
                albumArtUrl: albumArtUrl,
                previewUrl: previewUrl,
                durationMs: durationMs,
                venueName: venueName,
                venueAddress: venueAddress,
                latitude: latitude,
                longitude: longitude,
                startDate: startDate,
                endDate: endDate,
                ticketUrl: ticketUrl,
                ingredients: ingredients,
                steps: steps,
                prepTime: prepTime,
                cookTime: cookTime,
                servings: servings
            ) : nil
        }
    }

    enum CodingKeys: String, CodingKey {
        case itemId = "item_id"
        case entityId = "entity_id"
        case title
        case type
        case primaryEmoji = "primary_emoji"
        case sourceLabel = "source_label"
        case summary
        case createdAt = "created_at"
        case canonicalUrl = "canonical_url"
        case metadata
        case sharedByUser = "shared_by_user"
    }

    // Custom decoding to handle ISO8601 string dates
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        itemId = try container.decode(String.self, forKey: .itemId)
        entityId = try container.decode(String.self, forKey: .entityId)
        title = try container.decode(String.self, forKey: .title)
        type = try container.decode(EntityType.self, forKey: .type)
        primaryEmoji = try container.decode(String.self, forKey: .primaryEmoji)
        sourceLabel = try container.decode(String.self, forKey: .sourceLabel)
        summary = try container.decode(String.self, forKey: .summary)
        canonicalUrl = try container.decodeIfPresent(String.self, forKey: .canonicalUrl)
        metadata = try container.decode(Metadata.self, forKey: .metadata)
        sharedByUser = try container.decodeIfPresent(SharedByUser.self, forKey: .sharedByUser)

        // Decode created_at as ISO8601 string
        let dateString = try container.decode(String.self, forKey: .createdAt)

        // Try ISO8601 formatter with fractional seconds
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: dateString) {
            createdAt = date
        } else {
            // Try without fractional seconds
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) {
                createdAt = date
            } else {
                print("🔴 Failed to parse date: \(dateString)")
                throw DecodingError.dataCorruptedError(
                    forKey: .createdAt,
                    in: container,
                    debugDescription: "Date string '\(dateString)' does not match ISO8601 format"
                )
            }
        }
    }

    // For mock data and encoding
    init(itemId: String, entityId: String, title: String, type: EntityType,
         primaryEmoji: String, sourceLabel: String, summary: String,
         createdAt: Date, canonicalUrl: String? = nil, metadata: Metadata,
         sharedByUser: SharedByUser? = nil) {
        self.itemId = itemId
        self.entityId = entityId
        self.title = title
        self.type = type
        self.primaryEmoji = primaryEmoji
        self.sourceLabel = sourceLabel
        self.summary = summary
        self.createdAt = createdAt
        self.canonicalUrl = canonicalUrl
        self.metadata = metadata
        self.sharedByUser = sharedByUser
    }
}

// MARK: - Mock Data for Development
extension ItemSummary {
    static let mockArticle = ItemSummary(
        itemId: "1",
        entityId: "e1",
        title: "The Future of AI-Native Apps",
        type: .article,
        primaryEmoji: "🤖",
        sourceLabel: "FROM YOU",
        summary: "An exploration of how AI-first thinking is reshaping mobile app development.",
        createdAt: Date().addingTimeInterval(-3600),
        metadata: Metadata(
            sourceName: "TechCrunch",
            iconUrl: nil,
            tags: ["ai", "mobile", "development"],
            suggestedPrompts: ["Key takeaways?", "Similar articles?", "How does this affect iOS?"]
        )
    )

    static let mockSong = ItemSummary(
        itemId: "2",
        entityId: "e2",
        title: "Midnight City",
        type: .song,
        primaryEmoji: "🎵",
        sourceLabel: "FROM FRIEND",
        summary: "M83 · Hurry Up, We're Dreaming",
        createdAt: Date().addingTimeInterval(-7200),
        metadata: Metadata(
            sourceName: "Apple Music",
            iconUrl: nil,
            tags: ["electronic", "synth-pop"],
            suggestedPrompts: ["Similar artists?", "More synth-pop?", "What album is this from?"]
        )
    )

    static let mockEvent = ItemSummary(
        itemId: "3",
        entityId: "e3",
        title: "WWDC 2025",
        type: .event,
        primaryEmoji: "🎫",
        sourceLabel: "FOR YOU",
        summary: "Apple's annual developer conference in San Jose",
        createdAt: Date().addingTimeInterval(-10800),
        metadata: Metadata(
            sourceName: "apple.com",
            iconUrl: nil,
            tags: ["tech", "conference", "apple"],
            suggestedPrompts: ["When is it?", "How to attend?", "What to expect?"],
            venueName: "Apple Park",
            venueAddress: "One Apple Park Way, Cupertino, CA",
            latitude: 37.3349,
            longitude: -122.0090
        )
    )

    static let mockVideo = ItemSummary(
        itemId: "4",
        entityId: "e4",
        title: "Amazing Documentary About Space",
        type: .youtubeVideo,
        primaryEmoji: "🎬",
        sourceLabel: "FOR YOU",
        summary: "A fascinating look at the cosmos and our place in it.",
        createdAt: Date().addingTimeInterval(-14400),
        canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        metadata: Metadata(
            sourceName: "YouTube",
            iconUrl: nil,
            tags: ["space", "documentary"],
            suggestedPrompts: ["Key points?", "Related videos?"],
            videoId: "dQw4w9WgXcQ",
            videoPlatform: "youtube",
            durationSeconds: 212
        )
    )
    
    static let mockRecipe = ItemSummary(
        itemId: "5",
        entityId: "e5",
        title: "Perfect Chocolate Chip Cookies",
        type: .recipe,
        primaryEmoji: "🍪",
        sourceLabel: "FROM YOU",
        summary: "Crispy on the edges, chewy in the middle. The secret is browning the butter and using a mix of both sugars. Refrigerate the dough for deeper flavor.",
        createdAt: Date().addingTimeInterval(-18000),
        canonicalUrl: "https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe",
        metadata: Metadata(
            sourceName: "Serious Eats",
            iconUrl: nil,
            tags: ["dessert", "baking", "cookies"],
            suggestedPrompts: ["Can I make these gluten-free?", "How do I store them?", "What's the best chocolate to use?"],
            ingredients: [
                "2 cups all-purpose flour",
                "1 tsp baking soda",
                "1 tsp salt",
                "1 cup butter, browned",
                "1 cup brown sugar",
                "1/2 cup granulated sugar",
                "2 large eggs",
                "2 tsp vanilla extract",
                "2 cups chocolate chips"
            ],
            prepTime: "20 min",
            cookTime: "12 min",
            servings: 24
        )
    )
    
    static let mockTweet = ItemSummary(
        itemId: "6",
        entityId: "e6",
        title: "Exciting news about SwiftUI",
        type: .tweet,
        primaryEmoji: "🐦",
        sourceLabel: "FOR YOU",
        summary: "Just shipped a major update to our app using SwiftUI's new features. The declarative syntax makes complex UIs so much easier to build and maintain. Highly recommend checking out the new navigation APIs! 🚀",
        createdAt: Date().addingTimeInterval(-1800),
        canonicalUrl: "https://twitter.com/johnsundell/status/1234567890",
        metadata: Metadata(
            sourceName: "X",
            iconUrl: nil,
            tags: ["swiftui", "ios", "development"],
            suggestedPrompts: ["What are the new navigation APIs?", "Who is this person?", "Related tweets?"],
            authorName: "John Sundell",
            authorHandle: "@johnsundell",
            likeCount: 2847,
            repostCount: 312
        )
    )

    static let mockItems: [ItemSummary] = [mockArticle, mockSong, mockEvent, mockVideo, mockRecipe, mockTweet]
}
