import Foundation

/// Summary representation of a stash item, as returned by API endpoints
struct ItemSummary: Codable, Identifiable {
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

    var id: String { itemId }

    struct Metadata: Codable {
        let sourceName: String?
        let iconUrl: String?
        let tags: [String]
        let suggestedPrompts: [String]?

        enum CodingKeys: String, CodingKey {
            case sourceName = "source_name"
            case iconUrl = "icon_url"
            case tags
            case suggestedPrompts = "suggested_prompts"
        }
        
        init(sourceName: String?, iconUrl: String?, tags: [String], suggestedPrompts: [String]? = nil) {
            self.sourceName = sourceName
            self.iconUrl = iconUrl
            self.tags = tags
            self.suggestedPrompts = suggestedPrompts
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
         createdAt: Date, canonicalUrl: String? = nil, metadata: Metadata) {
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
            suggestedPrompts: ["When is it?", "How to attend?", "What to expect?"]
        )
    )

    static let mockItems: [ItemSummary] = [mockArticle, mockSong, mockEvent]
}
