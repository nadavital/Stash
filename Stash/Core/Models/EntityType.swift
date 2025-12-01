import Foundation

/// The type of content entity
enum EntityType: String, Codable, CaseIterable {
    case article
    case song
    case event
    case recipe
    case tweet
    case instagramPost = "instagram_post"
    case instagramReel = "instagram_reel"
    case tiktok
    case youtubeVideo = "youtube_video"
    case youtubeShort = "youtube_short"
    case threadsPost = "threads_post"
    case generic

    var displayName: String {
        switch self {
        case .article: return "Article"
        case .song: return "Song"
        case .event: return "Event"
        case .recipe: return "Recipe"
        case .tweet: return "Tweet"
        case .instagramPost: return "Instagram Post"
        case .instagramReel: return "Reel"
        case .tiktok: return "TikTok"
        case .youtubeVideo: return "YouTube Video"
        case .youtubeShort: return "YouTube Short"
        case .threadsPost: return "Threads Post"
        case .generic: return "Link"
        }
    }

    var icon: String {
        switch self {
        case .article: return "doc.text"
        case .song: return "music.note"
        case .event: return "calendar"
        case .recipe: return "fork.knife"
        case .tweet: return "bubble.left.and.bubble.right"
        case .instagramPost: return "photo"
        case .instagramReel: return "play.rectangle"
        case .tiktok: return "play.circle"
        case .youtubeVideo: return "play.rectangle.fill"
        case .youtubeShort: return "play.circle.fill"
        case .threadsPost: return "text.bubble"
        case .generic: return "link"
        }
    }
    
    var emoji: String {
        switch self {
        case .article: return "📰"
        case .song: return "🎵"
        case .event: return "🎟️"
        case .recipe: return "🍳"
        case .tweet: return "𝕏"
        case .instagramPost, .instagramReel: return "📸"
        case .tiktok: return "🎬"
        case .youtubeVideo, .youtubeShort: return "▶️"
        case .threadsPost: return "🧵"
        case .generic: return "🔗"
        }
    }
    
    /// Main filter categories (not all types are shown as filters)
    static var filterOptions: [EntityType] {
        [.article, .song, .event, .recipe]
    }
}
