import SwiftUI

/// Routes to appropriate content view based on item type
struct DetailContentRouter: View {
    let item: ItemSummary

    var body: some View {
        switch item.type {
        case .article, .generic:
            ArticleContentView(item: item)

        case .recipe:
            RecipeContentView(item: item)

        case .youtubeVideo, .youtubeShort, .tiktok:
            VideoContentView(item: item)

        case .song:
            MusicContentView(item: item)

        case .event:
            EventContentView(item: item)

        case .tweet, .threadsPost, .instagramPost, .instagramReel:
            SocialPostContentView(item: item)
        }
    }
}
