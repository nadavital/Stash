import Foundation

/// Search intent classification response
struct SearchIntent: Codable {
    let intent: IntentType
    let uiMode: UIMode
    let confidence: Double
    let cached: Bool
    let latencyMs: Int

    enum CodingKeys: String, CodingKey {
        case intent
        case uiMode = "ui_mode"
        case confidence
        case cached
        case latencyMs = "latency_ms"
    }

    enum IntentType: String, Codable {
        case findSaved = "find_saved"
        case discoverNew = "discover_new"
        case askQuestion = "ask_question"
    }

    enum UIMode: String, Codable {
        case stack
        case miniCard = "mini_card"
        case chat
    }
}
