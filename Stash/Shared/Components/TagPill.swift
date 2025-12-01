import SwiftUI

/// A styled pill for displaying a tag - consistent with ItemCardView tags
struct TagPill: View {
    let text: String

    var body: some View {
        Text("#\(text)")
            .font(StashTypography.caption)
            .foregroundColor(StashTheme.Color.accent)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(StashTheme.Color.accentSoft)
            .cornerRadius(StashTheme.Radius.pill)
    }
}

#Preview {
    HStack {
        TagPill(text: "recipe")
        TagPill(text: "cooking")
        TagPill(text: "italian")
    }
    .padding()
    .background(StashTheme.Color.bg)
}
