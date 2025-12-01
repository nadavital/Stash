import Foundation
import Supabase

/// Manages authentication session sharing between main app and Share Extension
/// Uses App Groups to share UserDefaults between targets
struct SharedAuthManager {
    static let suiteName = "group.Nadav.Stash"
    static let sessionKey = "supabase_session"
    static let userIdKey = "user_id"

    // Fallback file path for simulator (App Groups can be flaky)
    static let fallbackDirectory: URL? = {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suiteName)
    }()

    static let fallbackSessionFile: URL? = {
        fallbackDirectory?.appendingPathComponent("session.json")
    }()

    static let fallbackUserIdFile: URL? = {
        fallbackDirectory?.appendingPathComponent("user_id.txt")
    }()

    /// Save session to shared UserDefaults (called from main app after login)
    static func saveSession(_ session: Session, userId: String) {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            print("⚠️ Failed to access shared UserDefaults")
            return
        }

        print("🔵 SharedAuthManager: Saving session for user \(userId)")
        print("🔵 SharedAuthManager: Access token length: \(session.accessToken.count)")

        // Save access token directly as string (more reliable than encoding entire Session)
        defaults.set(session.accessToken, forKey: "access_token")
        defaults.set(userId, forKey: userIdKey)

        // Also save the full session as backup
        let encoder = JSONEncoder()
        if let sessionData = try? encoder.encode(session) {
            defaults.set(sessionData, forKey: sessionKey)
        }

        let success = defaults.synchronize()
        print("🔵 SharedAuthManager: synchronize() returned: \(success)")

        // Verify it was written
        if let savedToken = defaults.string(forKey: "access_token") {
            print("✅ Session saved to shared storage - token length: \(savedToken.count)")
        } else {
            print("❌ Session was set but cannot be read back!")
        }
    }

    /// Get session from shared UserDefaults (called from Share Extension)
    static func getSession() -> Session? {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            print("⚠️ Failed to access shared UserDefaults")
            return nil
        }

        guard let sessionData = defaults.data(forKey: sessionKey) else {
            print("⚠️ No session found in shared storage")
            return nil
        }

        let decoder = JSONDecoder()
        if let session = try? decoder.decode(Session.self, from: sessionData) {
            print("✅ Session loaded from shared storage")
            return session
        } else {
            print("❌ Failed to decode session")
            return nil
        }
    }

    /// Get user ID from shared UserDefaults
    static func getUserId() -> String? {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return nil
        }
        return defaults.string(forKey: userIdKey)
    }

    /// Clear session from shared UserDefaults (called on sign out)
    static func clearSession() {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return
        }

        defaults.removeObject(forKey: sessionKey)
        defaults.removeObject(forKey: userIdKey)
        defaults.removeObject(forKey: "access_token")
        defaults.synchronize()
        print("✅ Session cleared from shared storage")
    }

    /// Get access token for API calls (convenience method)
    static func getAccessToken() -> String? {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return nil
        }
        return defaults.string(forKey: "access_token")
    }

    /// Save pending URL from Share Extension (workaround for network restrictions)
    static func savePendingURL(_ url: String, source: String = "self") {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return
        }
        var pending = getPendingURLs()
        let item: [String: String] = ["url": url, "source": source]
        pending.append(item)
        defaults.set(pending, forKey: "pending_urls")
        defaults.synchronize()
        print("✅ Saved pending URL to shared storage with source: \(source)")
    }

    /// Get pending URLs to process
    static func getPendingURLs() -> [[String: String]] {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return []
        }
        return defaults.array(forKey: "pending_urls") as? [[String: String]] ?? []
    }

    /// Clear pending URLs after processing
    static func clearPendingURLs() {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return
        }
        defaults.removeObject(forKey: "pending_urls")
        defaults.synchronize()
    }

    /// Save item ID that needs to be shared with friend
    static func savePendingShare(itemId: String) {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return
        }
        defaults.set(itemId, forKey: "pending_share_item")
        defaults.synchronize()
    }

    /// Get and clear pending share item ID
    static func getPendingShareItemId() -> String? {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return nil
        }
        let itemId = defaults.string(forKey: "pending_share_item")
        defaults.removeObject(forKey: "pending_share_item")
        defaults.synchronize()
        return itemId
    }
}
