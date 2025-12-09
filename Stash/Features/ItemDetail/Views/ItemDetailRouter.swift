import SwiftUI

/// Smart router that chooses the appropriate detail view based on content type
/// Following the Preview → Engage → Act pattern:
/// - Native views show AI-enriched previews with connector actions
/// - WebView available for full content engagement
/// - Deep links for native app interactions
struct ItemDetailRouter: View {
    let item: ItemSummary
    var relatedItems: [ItemSummary] = []
    var friends: [Friend] = []
    
    var body: some View {
        switch item.type {
        // Recipes - Native preview with ingredients, "View Full Recipe" opens WebView
        case .recipe:
            RecipeDetailView(item: item)
        
        // Social posts - Native render with author, media, metrics
        case .tweet, .threadsPost, .instagramPost:
            SocialPostDetailView(item: item)
        
        // Video content - Native player with embedded YouTube/TikTok
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel:
            VideoDetailView(item: item)
        
        // Events - Native with MapKit + EventKit integrations
        case .event:
            EventDetailView(item: item)
        
        // Music - Native player with album art, preview playback
        case .song:
            MusicDetailView(item: item)
        
        // Articles - WebView is the content (articles ARE web pages)
        case .article, .generic:
            ContentDetailView(item: item)
        }
    }
}

// MARK: - Preview

#Preview("Article") {
    NavigationStack {
        ItemDetailRouter(item: .mockArticle)
    }
}

#Preview("Recipe") {
    NavigationStack {
        ItemDetailRouter(item: .mockRecipe)
    }
}

#Preview("Tweet") {
    NavigationStack {
        ItemDetailRouter(item: .mockTweet)
    }
}

#Preview("Song") {
    NavigationStack {
        ItemDetailRouter(item: .mockSong)
    }
}

#Preview("Event") {
    NavigationStack {
        ItemDetailRouter(item: .mockEvent)
    }
}

#Preview("Video") {
    NavigationStack {
        ItemDetailRouter(item: .mockVideo)
    }
}
