import SwiftUI

struct StashTypography {
    // Page title: 28–32, semibold
    static let pageTitle = Font.system(size: 30, weight: .semibold)

    // Section title: 20–22, semibold
    static let sectionTitle = Font.system(size: 21, weight: .semibold)

    // Card title: 16–17, medium/semibold
    static let cardTitle = Font.system(size: 17, weight: .semibold)

    // Body text: 14–15, regular
    static let body = Font.system(size: 15, weight: .regular)

    // Meta / labels: 12–13, regular, increased letter spacing
    static let meta = Font.system(size: 12, weight: .regular)

    // Caption: 11, regular
    static let caption = Font.system(size: 11, weight: .regular)
}

// MARK: - Typography Alias for convenience

enum Typography {
    static let largeTitle = Font.largeTitle
    static let title = Font.title
    static let title2 = Font.title2
    static let title3 = Font.title3
    static let headline = Font.headline
    static let body = Font.body
    static let callout = Font.callout
    static let subheadline = Font.subheadline
    static let footnote = Font.footnote
    static let caption = Font.caption
    static let caption2 = Font.caption2
    
    // All caps style for labels
    static let overline = Font.system(size: 10, weight: .semibold)
}
