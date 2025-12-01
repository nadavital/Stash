import Foundation
import Combine

/// ViewModel for authentication flow
@MainActor
class AuthViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let authManager = AuthManager.shared

    /// Sign in with email and password
    func signIn() async {
        isLoading = true
        errorMessage = nil

        do {
            try await authManager.signIn(email: email, password: password)
        } catch {
            // Check for email confirmation error
            let errorDesc = error.localizedDescription
            if errorDesc.contains("Email not confirmed") || errorDesc.contains("email_not_confirmed") {
                errorMessage = "Please check your email to confirm your account, or disable email confirmation in Supabase settings for testing."
            } else {
                errorMessage = errorDesc
            }
        }

        isLoading = false
    }

    /// Sign up with email and password
    func signUp() async {
        isLoading = true
        errorMessage = nil

        // Basic validation
        guard password.count >= 6 else {
            errorMessage = "Password must be at least 6 characters"
            isLoading = false
            return
        }

        guard email.contains("@") else {
            errorMessage = "Please enter a valid email address"
            isLoading = false
            return
        }

        do {
            try await authManager.signUp(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
