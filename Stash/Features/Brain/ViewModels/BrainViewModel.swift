import Foundation
import SwiftUI
import Combine

/// ViewModel for the Brain (chat) tab
@MainActor
class BrainViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var isLoading = false
    @Published var error: Error?
    @Published var inputText = ""
    
    /// The currently focused item ID (when user is asking about a specific item)
    /// This persists throughout the conversation until explicitly changed or cleared
    var focusedItemId: String?

    private let apiClient = APIClient.shared

    /// Build conversation history from messages for context
    private func buildConversationHistory() -> [APIClient.ConversationMessage] {
        // Take the last 10 messages to avoid token limits
        let recentMessages = messages.suffix(10)
        return recentMessages.map { message in
            APIClient.ConversationMessage(
                role: message.isUser ? "user" : "assistant",
                content: message.text
            )
        }
    }

    /// Send a message to the AI
    func sendMessage() async {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let userMessageText = inputText
        inputText = "" // Clear input immediately

        // Add user message
        let userMessage = ChatMessage(text: userMessageText, isUser: true)
        messages.append(userMessage)

        isLoading = true
        error = nil

        do {
            // Build conversation history BEFORE adding the current message
            // (the current message is passed separately)
            let history = buildConversationHistory().dropLast() // Remove the just-added user message
            
            let response = try await apiClient.chatWithStash(
                message: userMessageText,
                focusedItemId: focusedItemId,
                conversationHistory: Array(history)
            )
            
            // Don't clear focusedItemId - maintain context throughout the conversation

            // Add AI response
            let aiMessage = ChatMessage(
                text: response.answer,
                isUser: false,
                referencedItems: response.referencedItems
            )
            messages.append(aiMessage)
        } catch {
            self.error = error
            // Add error message
            let errorMessage = ChatMessage(
                text: "Sorry, I couldn't process that. Please try again.",
                isUser: false
            )
            messages.append(errorMessage)
        }

        isLoading = false
    }

    /// Send a suggested prompt
    func sendSuggestedPrompt(_ prompt: String) async {
        inputText = prompt
        await sendMessage()
    }
    
    /// Send a suggested prompt with a focused item context
    func sendSuggestedPrompt(_ prompt: String, focusedItemId: String?) async {
        self.focusedItemId = focusedItemId
        inputText = prompt
        await sendMessage()
    }
    
    /// Clear conversation and reset context
    func clearConversation() {
        messages.removeAll()
        focusedItemId = nil
    }
}
