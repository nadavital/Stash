import Foundation
import Combine

/// ViewModel for interests onboarding flow
@MainActor
class InterestsOnboardingViewModel: ObservableObject {
    @Published var interestsText = ""
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let authManager = AuthManager.shared
    private let apiClient = APIClient.shared
    
    /// Submit interests to backend for parsing and profile creation
    func submitInterests() async {
        let trimmed = interestsText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        
        isLoading = true
        errorMessage = nil
        
        do {
            try await apiClient.parseInterests(interests: trimmed)
            
            // Mark onboarding as complete
            authManager.needsInterestsOnboarding = false
        } catch {
            errorMessage = "Couldn't save your interests. Please try again."
            print("Error parsing interests: \(error)")
        }
        
        isLoading = false
    }
    
    /// Skip onboarding (user can set interests later)
    func skipOnboarding() {
        authManager.needsInterestsOnboarding = false
    }
}
