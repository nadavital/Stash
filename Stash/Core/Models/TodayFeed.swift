import Foundation

/// Response from GET /feed/today endpoint
struct TodayFeed: Codable {
    let aiSubtitle: String
    var brainSnack: [ItemSummary]
    var fromFriends: [ItemSummary]
    var byYou: [ItemSummary]
    var forYou: [ItemSummary]

    enum CodingKeys: String, CodingKey {
        case aiSubtitle = "ai_subtitle"
        case brainSnack = "brain_snack"
        case fromFriends = "from_friends"
        case byYou = "by_you"
        case forYou = "for_you"
    }
}

// MARK: - Mock Data for Development
extension TodayFeed {
    static let mock = TodayFeed(
        aiSubtitle: "Feels like a cozy reading + great music kind of day.",
        brainSnack: [ItemSummary.mockArticle, ItemSummary.mockSong],
        fromFriends: [ItemSummary.mockSong],
        byYou: [ItemSummary.mockArticle],
        forYou: [ItemSummary.mockEvent]
    )
}
