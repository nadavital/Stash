import SwiftUI

/// Reusable row component for displaying stash items in lists
struct StashItemRow: View {
    let item: ItemSummary

    var body: some View {
        HStack(spacing: Spacing.md) {
            Text(item.primaryEmoji)
                .font(.system(size: 24))
                .frame(width: 44, height: 44)
                .background(StashTheme.Color.surfaceSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(Typography.body.weight(.medium))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(1)

                HStack(spacing: Spacing.xs) {
                    Text(item.type.displayName)
                        .font(Typography.caption)
                        .foregroundStyle(StashTheme.Color.textMuted)

                    if let source = item.metadata.sourceName {
                        Text("•")
                            .foregroundStyle(StashTheme.Color.textMuted)
                        Text(source)
                            .font(Typography.caption)
                            .foregroundStyle(StashTheme.Color.textMuted)
                    }
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .padding()
        .background(StashTheme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: StashTheme.Radius.tile))
    }
}
