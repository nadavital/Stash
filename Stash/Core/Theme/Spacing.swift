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

// MARK: - Standard Spacing Scale

enum Spacing {
    /// 4pt - Tight spacing for related elements
    static let xs: CGFloat = 4
    
    /// 8pt - Small spacing
    static let sm: CGFloat = 8
    
    /// 12pt - Medium spacing
    static let md: CGFloat = 12
    
    /// 16pt - Large spacing (standard padding)
    static let lg: CGFloat = 16
    
    /// 24pt - Extra large spacing (between sections)
    static let xl: CGFloat = 24
    
    /// 32pt - Double extra large
    static let xxl: CGFloat = 32
}
