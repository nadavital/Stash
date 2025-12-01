import Foundation

/// Response from GET /profile/overview endpoint
struct ProfileOverview: Codable {
    let name: String?
    let handle: String
    let stats: Stats

    struct Stats: Codable {
        let totalItems: Int
        let topTags: [String]
        let typeMix: TypeMix

        enum CodingKeys: String, CodingKey {
            case totalItems = "total_items"
            case topTags = "top_tags"
            case typeMix = "type_mix"
        }
    }

    struct TypeMix: Codable {
        let article: Double
        let song: Double
        let event: Double
        let recipe: Double
        let generic: Double
    }
}

// MARK: - Mock Data for Development
extension ProfileOverview {
    static let mock = ProfileOverview(
        name: "Nadav",
        handle: "nadav",
        stats: Stats(
            totalItems: 127,
            topTags: ["ai", "music", "tech", "recipes", "concerts"],
            typeMix: TypeMix(
                article: 0.45,
                song: 0.25,
                event: 0.15,
                recipe: 0.10,
                generic: 0.05
            )
        )
    )
}
