import SwiftUI

/// Reusable card view for displaying a stash item
struct ItemCardView: View {
    let item: ItemSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Top row: Type chip and source label
            HStack {
                TypeChip(type: item.type)
                Spacer()
                SourceLabel(label: item.sourceLabel)
            }

            // Emoji/Image and title
            HStack(alignment: .top, spacing: 12) {
                // Show cover art if available, otherwise emoji
                if let iconUrl = item.metadata.iconUrl, let url = URL(string: iconUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 60, height: 60)
                            .cornerRadius(StashTheme.Radius.tile)
                    } placeholder: {
                        ProgressView()
                            .frame(width: 60, height: 60)
                    }
                } else {
                    EmojiView(item.primaryEmoji, size: 40)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title.htmlDecoded)
                        .font(StashTypography.cardTitle)
                        .foregroundColor(StashTheme.Color.textPrimary)
                        .lineLimit(2)

                    Text(item.summary)
                        .font(StashTypography.body)
                        .foregroundColor(StashTheme.Color.textSecondary)
                        .lineLimit(2)
                }
            }

            // Bottom metadata
            if let sourceName = item.metadata.sourceName {
                Text(sourceName)
                    .font(StashTypography.caption)
                    .foregroundColor(StashTheme.Color.textMuted)
            }

            // Tags
            if !item.metadata.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: StashSpacing.related) {
                        ForEach(item.metadata.tags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(StashTypography.caption)
                                .foregroundColor(StashTheme.Color.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(StashTheme.Color.accentSoft)
                                .cornerRadius(StashTheme.Radius.pill)
                        }
                    }
                }
            }
        }
        .padding(StashSpacing.cardPadding)
        .cardStyle()
    }
}

#Preview {
    VStack(spacing: 16) {
        ItemCardView(item: .mockArticle)
        ItemCardView(item: .mockSong)
        ItemCardView(item: .mockEvent)
    }
    .padding()
}
