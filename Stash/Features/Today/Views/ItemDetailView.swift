import SwiftUI

/// Router view that displays type-specific detail views
struct ItemDetailView: View {
    let item: ItemSummary

    var body: some View {
        Group {
            switch item.type {
            case .song:
                SongDetailView(item: item)
            case .event:
                EventDetailView(item: item)
            case .article:
                ArticleDetailView(item: item)
            case .recipe:
                RecipeDetailView(item: item)
            case .tweet, .instagramPost, .instagramReel, .tiktok, .youtubeVideo, .youtubeShort, .threadsPost:
                SocialMediaDetailView(item: item)
            default:
                // Use generic view as fallback for all other types
                GenericDetailView(item: item)
            }
        }
    }
}

#Preview {
    NavigationStack {
        ItemDetailView(item: .mockSong)
    }
}
