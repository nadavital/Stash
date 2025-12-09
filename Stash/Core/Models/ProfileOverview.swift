import Foundation

/// Response from GET /profile/overview endpoint
struct ProfileOverview: Codable {
    let name: String?
    let handle: String
    let stats: Stats
    let taste: TasteProfile?

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
    
    struct TasteProfile: Codable {
        let onboardingInterests: OnboardingInterests?
        let topCategories: [String: Double]?
        let entityTypePreferences: [String: Double]?
        let preferredSources: [String]?
        let lastComputedAt: String?
        
        enum CodingKeys: String, CodingKey {
            case onboardingInterests = "onboarding_interests"
            case topCategories = "top_categories"
            case entityTypePreferences = "entity_type_preferences"
            case preferredSources = "preferred_sources"
            case lastComputedAt = "last_computed_at"
        }
        
        struct OnboardingInterests: Codable {
            let rawInput: String?
            let parsedKeywords: [String]?
            
            enum CodingKeys: String, CodingKey {
                case rawInput = "raw_input"
                case parsedKeywords = "parsed_keywords"
            }
        }
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
        ),
        taste: TasteProfile(
            onboardingInterests: TasteProfile.OnboardingInterests(
                rawInput: "indie rock, cooking, AI and machine learning, NBA basketball",
                parsedKeywords: ["indie rock", "cooking", "AI", "machine learning", "NBA", "basketball"]
            ),
            topCategories: ["Technology": 0.35, "Music": 0.25, "Sports": 0.20, "Food": 0.15],
            entityTypePreferences: ["article": 0.45, "song": 0.30, "event": 0.15],
            preferredSources: ["Spotify", "The Verge", "YouTube"],
            lastComputedAt: "2025-12-01T10:30:00Z"
        )
    )
}
