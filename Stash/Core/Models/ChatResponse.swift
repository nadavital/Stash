import Foundation

/// Response from POST /chat_with_stash endpoint
struct ChatResponse: Codable {
    let answer: String
    let referencedItems: [ItemSummary]

    enum CodingKeys: String, CodingKey {
        case answer
        case referencedItems = "referenced_items"
    }
}

/// A chat message in the Brain tab
struct ChatMessage: Identifiable {
    let id: UUID
    let text: String
    let isUser: Bool
    let referencedItems: [ItemSummary]
    let timestamp: Date

    init(id: UUID = UUID(), text: String, isUser: Bool, referencedItems: [ItemSummary] = [], timestamp: Date = Date()) {
        self.id = id
        self.text = text
        self.isUser = isUser
        self.referencedItems = referencedItems
        self.timestamp = timestamp
    }
}

// MARK: - Mock Data for Development
extension ChatMessage {
    static let mockUserMessage = ChatMessage(
        text: "What can I do right now?",
        isUser: true
    )

    static let mockAIMessage = ChatMessage(
        text: "Right now you could read \"The Future of AI-Native Apps\" - it's a quick 5-minute read about AI in mobile development. Or if you're in the mood for music, I noticed you saved \"Midnight City\" by M83.",
        isUser: false,
        referencedItems: [ItemSummary.mockArticle, ItemSummary.mockSong]
    )

    static let mockConversation: [ChatMessage] = [
        mockUserMessage,
        mockAIMessage
    ]
}
