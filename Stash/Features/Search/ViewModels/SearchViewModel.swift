import SwiftUI
import Combine

/// ViewModel for the Search/Stash interface
@MainActor
class SearchViewModel: ObservableObject {
    @Published var searchText = ""
    @Published var messages: [ChatMessage] = []
    @Published var searchResults: [ItemSummary] = []
    @Published var isLoading = false
    @Published var error: Error?
    
    let isVoiceEnabled = false // Future feature
    
    private let apiClient = APIClient.shared
    private var conversationHistory: [APIClient.ConversationMessage] = []
    
    func sendMessage() {
        let text = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        
        // Add user message
        let userMessage = ChatMessage(
            text: text,
            isUser: true
        )
        messages.append(userMessage)
        
        // Add to conversation history for context
        conversationHistory.append(APIClient.ConversationMessage(role: "user", content: text))
        
        searchText = ""
        
        // Get AI response
        Task {
            await getAIResponse(for: text)
        }
    }
    
    private func getAIResponse(for query: String) async {
        isLoading = true
        
        do {
            // Use existing chatWithStash method
            let response = try await apiClient.chatWithStash(
                message: query,
                conversationHistory: conversationHistory
            )
            
            // Add assistant response to history
            conversationHistory.append(APIClient.ConversationMessage(role: "assistant", content: response.answer))
            
            // Create message with response
            let aiMessage = ChatMessage(
                text: response.answer,
                isUser: false,
                referencedItems: response.referencedItems
            )
            
            messages.append(aiMessage)
        } catch {
            self.error = error
            print("🔴 Chat error: \(error)")
            
            // Add error message
            let errorMessage = ChatMessage(
                text: "Sorry, I couldn't process that request. Please try again.",
                isUser: false
            )
            messages.append(errorMessage)
        }
        
        isLoading = false
    }
    
    func search() async {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return }
        
        isLoading = true
        searchResults = []
        
        do {
            // Use existing searchItems method
            searchResults = try await apiClient.searchItems(query: query)
        } catch {
            self.error = error
            print("🔴 Search error: \(error)")
        }
        
        isLoading = false
    }
    
    func clearConversation() {
        messages = []
        searchResults = []
        conversationHistory = []
    }
}
