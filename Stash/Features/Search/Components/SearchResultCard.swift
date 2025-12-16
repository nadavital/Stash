import SwiftUI

/// Search result card for displaying items in search results
struct SearchResultCard: View {
    let item: ItemSummary

    var body: some View {
        // TODO: Add navigation when detail views are rebuilt
        Button {
            // Placeholder
        } label: {
            HStack(spacing: Spacing.md) {
                // Emoji icon
                Text(item.primaryEmoji)
                    .font(.system(size: 32))
                    .frame(width: 50, height: 50)
                    .background(StashTheme.Color.surfaceSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(Typography.body.weight(.semibold))
                        .foregroundStyle(StashTheme.Color.textPrimary)
                        .lineLimit(1)

                    Text(item.summary)
                        .font(Typography.caption)
                        .foregroundStyle(StashTheme.Color.textSecondary)
                        .lineLimit(2)

                    HStack(spacing: Spacing.xs) {
                        Text(item.type.displayName)
                            .font(Typography.caption2)
                            .foregroundStyle(StashTheme.Color.textMuted)

                        if let source = item.metadata.sourceName {
                            Text("•")
                                .foregroundStyle(StashTheme.Color.textMuted)
                            Text(source)
                                .font(Typography.caption2)
                                .foregroundStyle(StashTheme.Color.textMuted)
                        }
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            .padding()
            .background(StashTheme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
