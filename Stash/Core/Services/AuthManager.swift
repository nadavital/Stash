import Foundation
import Supabase
import SwiftUI
import Combine

/// Authentication manager for Supabase Auth
@MainActor
class AuthManager: ObservableObject {
    /// Shared instance
    static let shared = AuthManager()

    private let supabase = SupabaseClientManager.shared.client

    /// Whether initial auth check is still in progress
    @Published var isCheckingAuth = true
    
    /// Current authentication state
    @Published var isAuthenticated = false

    /// Current user ID
    @Published var userId: UUID?

    /// Current user handle
    @Published var userHandle: String?

    /// Whether user needs to set up their handle
    @Published var needsHandleSetup = false
    
    /// Whether user needs to complete interests onboarding
    @Published var needsInterestsOnboarding = false

    private init() {
        Task {
            await checkAuthStatus()
        }
    }

    /// Check current authentication status
    func checkAuthStatus() async {
        print("🔵 AuthManager: Checking auth status...")
        isCheckingAuth = true
        
        do {
            let session = try await supabase.auth.session
            print("🔵 AuthManager: Got session for user \(session.user.id)")
            userId = session.user.id

            // Save session to shared storage for Share Extension
            print("🔵 AuthManager: Calling SharedAuthManager.saveSession...")
            SharedAuthManager.saveSession(session, userId: session.user.id.uuidString)

            // Fetch user handle from app_users table BEFORE setting isAuthenticated
            // This prevents the MainTabView from briefly appearing before we know the full state
            await fetchUserHandle()
            
            // Only set isAuthenticated after all checks are complete
            isAuthenticated = true
        } catch {
            print("❌ AuthManager: No session found - \(error.localizedDescription)")
            isAuthenticated = false
            userId = nil
            userHandle = nil
            needsHandleSetup = false
            needsInterestsOnboarding = false
        }
        
        isCheckingAuth = false
    }

    /// Fetch user handle from database
    private func fetchUserHandle() async {
        guard let userId = userId else { return }

        do {
            struct UserRow: Decodable {
                let handle: String
            }

            let response: UserRow = try await supabase.database
                .from("app_users")
                .select("handle")
                .eq("user_id", value: userId.uuidString)
                .single()
                .execute()
                .value

            userHandle = response.handle
            needsHandleSetup = false
            
            // Check if user has completed interests onboarding
            await checkInterestsOnboarding()
        } catch {
            // User doesn't have a handle yet
            userHandle = nil
            needsHandleSetup = true
            needsInterestsOnboarding = false
        }
    }
    
    /// Check if user has completed interests onboarding
    private func checkInterestsOnboarding() async {
        guard let userId = userId else { return }
        
        do {
            struct TasteProfileRow: Decodable {
                let onboarding_interests: OnboardingData?
                
                struct OnboardingData: Decodable {
                    let raw_input: String?
                    let parsed_keywords: [String]?
                }
            }
            
            let response: TasteProfileRow = try await supabase.database
                .from("user_taste_profiles")
                .select("onboarding_interests")
                .eq("user_id", value: userId.uuidString)
                .single()
                .execute()
                .value
            
            // If onboarding_interests exists and has raw_input with content, user completed onboarding
            if let onboarding = response.onboarding_interests,
               let rawInput = onboarding.raw_input,
               !rawInput.isEmpty {
                needsInterestsOnboarding = false
            } else {
                needsInterestsOnboarding = true
            }
        } catch {
            // No taste profile yet - needs onboarding
            needsInterestsOnboarding = true
        }
    }

    /// Sign up with email and password (creates auth account only)
    func signUp(email: String, password: String) async throws {
        let response = try await supabase.auth.signUp(
            email: email,
            password: password
        )

        userId = response.user.id
        needsHandleSetup = true
        needsInterestsOnboarding = false  // Handle setup comes first

        // Save session to shared storage for Share Extension
        if let session = response.session {
            SharedAuthManager.saveSession(session, userId: response.user.id.uuidString)
        }
        
        // Set authenticated last after all state is configured
        isAuthenticated = true
    }

    /// Sign in with email and password
    func signIn(email: String, password: String) async throws {
        let response = try await supabase.auth.signIn(
            email: email,
            password: password
        )

        userId = response.user.id

        // Save session to shared storage for Share Extension
        SharedAuthManager.saveSession(response, userId: response.user.id.uuidString)

        // Fetch user handle from app_users table BEFORE setting isAuthenticated
        await fetchUserHandle()
        
        // Set authenticated last after all state is configured
        isAuthenticated = true
    }

    /// Sign out
    func signOut() async throws {
        try await supabase.auth.signOut()
        isAuthenticated = false
        userId = nil
        userHandle = nil

        // Clear session from shared storage
        SharedAuthManager.clearSession()
    }

    /// Check if handle is available
    func checkHandleAvailability(handle: String) async throws -> Bool {
        do {
            struct UserHandleRow: Decodable {
                let handle: String
            }

            // Try to find a user with this handle
            let response: [UserHandleRow] = try await supabase.database
                .from("app_users")
                .select("handle")
                .eq("handle", value: handle)
                .execute()
                .value

            // Handle is available if no rows returned
            return response.isEmpty
        } catch {
            // If there's an error (like table doesn't exist or network issue),
            // assume handle is available rather than blocking the user
            print("Error checking handle availability: \(error)")
            return true
        }
    }

    /// Set user handle in the database
    func setUserHandle(handle: String) async throws {
        guard let userId = userId else {
            throw APIError.unauthorized
        }

        print("🔵 Attempting to insert handle: \(handle) for user: \(userId.uuidString)")

        struct UserInsert: Codable {
            let user_id: String
            let handle: String
        }

        let insert = UserInsert(
            user_id: userId.uuidString,
            handle: handle
        )

        do {
            print("🔵 Calling Supabase SDK insert...")

            // Use the SDK with proper error handling
            try await supabase.database
                .from("app_users")
                .insert(insert)
                .execute()

            print("🟢 Handle set successfully via SDK!")
            userHandle = handle
            needsHandleSetup = false
            needsInterestsOnboarding = true  // Now needs interests onboarding
        } catch {
            print("🔴 Error setting user handle: \(error)")
            print("🔴 Error type: \(type(of: error))")
            throw error
        }
    }
}
