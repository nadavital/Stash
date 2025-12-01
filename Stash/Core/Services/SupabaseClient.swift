import Foundation
import Supabase
import Combine

/// Singleton Supabase client manager for the Stash app
@MainActor
class SupabaseClientManager: ObservableObject {
    /// Shared instance
    static let shared = SupabaseClientManager()

    /// The Supabase client instance
    let client: SupabaseClient

    private init() {
        guard let url = URL(string: AppEnvironment.supabaseURL) else {
            fatalError("Invalid Supabase URL: \(AppEnvironment.supabaseURL)")
        }

        self.client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: AppEnvironment.supabaseAnonKey
        )
    }

    /// Current authenticated user session
    var session: Session? {
        get async {
            try? await client.auth.session
        }
    }

    /// Current user ID (if authenticated)
    var userId: UUID? {
        get async {
            await session?.user.id
        }
    }
}
