import SwiftUI

/// A chip that displays the entity type (Article, Song, Event, etc.)
struct TypeChip: View {
    let type: EntityType

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: type.icon)
                .font(.system(size: 10, weight: .medium))
            Text(type.displayName)
                .font(StashTypography.caption)
        }
        .foregroundColor(StashTheme.Color.textSecondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(StashTheme.Color.surfaceSoft)
        .cornerRadius(StashTheme.Radius.pill)
    }
}

#Preview {
    VStack(spacing: 12) {
        TypeChip(type: .article)
        TypeChip(type: .song)
        TypeChip(type: .event)
        TypeChip(type: .recipe)
        TypeChip(type: .generic)
    }
    .padding()
}
