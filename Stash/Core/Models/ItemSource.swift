import Foundation

/// The source of a stash item
enum ItemSource: String, Codable {
    case `self`
    case friendLink = "friend_link"
    case friendUser = "friend_user"
    case aiRecommendation = "ai_recommendation"

    var displayLabel: String {
        switch self {
        case .self: return "FROM YOU"
        case .friendLink, .friendUser: return "FROM FRIEND"
        case .aiRecommendation: return "FOR YOU"
        }
    }
}
