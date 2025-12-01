import SwiftUI

struct StashSpacing {
    // Outer horizontal padding
    static let screenHorizontal: CGFloat = 18

    // Vertical spacing between major sections
    static let sectionVertical: CGFloat = 20

    // Spacing between related elements
    static let related: CGFloat = 6

    // Card internal padding
    static let cardPadding: CGFloat = 14

    // Hero image heights for detail views (reduced for cleaner design)
    static let heroSongHeight: CGFloat = 320       // 1:1 square - preserves album art
    static let heroArticleHeight: CGFloat = 300    // 3:2 landscape - editorial style
    static let heroRecipeHeight: CGFloat = 300     // 3:2 landscape - editorial style
    static let heroEventHeight: CGFloat = 280      // 16:9 widescreen - video native
    static let heroSocialHeight: CGFloat = 280     // 16:9 widescreen - video native
    static let heroEmojiFallback: CGFloat = 100    // Emoji for no-image fallback
}
