import SwiftUI

/// Search result card for displaying items in search results
struct SearchResultCard: View {
    let item: ItemSummary

    var body: some View {
        // TODO: Add navigation when detail views are rebuilt
        Button {
            // Placeholder
        } label: {
            HStack(spacing: 12) {
                // Emoji icon
                Text(item.primaryEmoji)
                    .font(.system(size: 32))
                    .frame(width: 50, height: 50)
                    .background(Color.gray.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(item.summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    HStack(spacing: 4) {
                        Text(item.type.displayName)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)

                        if let source = item.metadata.sourceName {
                            Text("•")
                                .foregroundStyle(.tertiary)
                            Text(source)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(Color.gray.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
