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

    /// Current authentication state
    @Published var isAuthenticated = false

    /// Current user ID
    @Published var userId: UUID?

    /// Current user handle
    @Published var userHandle: String?

    /// Whether user needs to set up their handle
    @Published var needsHandleSetup = false

    private init() {
        Task {
            await checkAuthStatus()
        }
    }

    /// Check current authentication status
    func checkAuthStatus() async {
        print("🔵 AuthManager: Checking auth status...")
        do {
            let session = try await supabase.auth.session
            print("🔵 AuthManager: Got session for user \(session.user.id)")
            isAuthenticated = true
            userId = session.user.id

            // Save session to shared storage for Share Extension
            print("🔵 AuthManager: Calling SharedAuthManager.saveSession...")
            SharedAuthManager.saveSession(session, userId: session.user.id.uuidString)

            // Fetch user handle from app_users table
            await fetchUserHandle()
        } catch {
            print("❌ AuthManager: No session found - \(error.localizedDescription)")
            isAuthenticated = false
            userId = nil
            userHandle = nil
            needsHandleSetup = false
        }
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
        } catch {
            // User doesn't have a handle yet
            userHandle = nil
            needsHandleSetup = true
        }
    }

    /// Sign up with email and password (creates auth account only)
    func signUp(email: String, password: String) async throws {
        let response = try await supabase.auth.signUp(
            email: email,
            password: password
        )

        isAuthenticated = true
        userId = response.user.id
        needsHandleSetup = true

        // Save session to shared storage for Share Extension
        if let session = response.session {
            SharedAuthManager.saveSession(session, userId: response.user.id.uuidString)
        }
    }

    /// Sign in with email and password
    func signIn(email: String, password: String) async throws {
        let response = try await supabase.auth.signIn(
            email: email,
            password: password
        )

        isAuthenticated = true
        userId = response.user.id

        // Save session to shared storage for Share Extension
        SharedAuthManager.saveSession(response, userId: response.user.id.uuidString)

        // Fetch user handle from app_users table
        await fetchUserHandle()
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
        } catch {
            print("🔴 Error setting user handle: \(error)")
            print("🔴 Error type: \(type(of: error))")
            throw error
        }
    }
}
