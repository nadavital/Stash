import SwiftUI

/// Related Items Section - AI-powered related content carousel
struct RelatedItemsSection: View {
    let items: [ItemSummary]
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(StashTypography.sectionTitle)
                .foregroundColor(StashTheme.Color.textPrimary)
                .padding(.horizontal, StashSpacing.screenHorizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    // Leading spacer
                    Spacer()
                        .frame(width: StashSpacing.screenHorizontal - 12)

                    ForEach(items) { item in
                        NavigationLink(destination: ItemDetailView(item: item)) {
                            RelatedItemCard(item: item)
                        }
                        .buttonStyle(.plain)
                    }

                    // Trailing spacer
                    Spacer()
                        .frame(width: StashSpacing.screenHorizontal - 12)
                }
            }
        }
    }
}

/// Related Item Card - Mini version of item card for horizontal scroll
struct RelatedItemCard: View {
    let item: ItemSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Thumbnail
            ZStack {
                if let iconUrl = item.metadata.iconUrl, let url = URL(string: iconUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 180, height: 120)
                            .clipped()
                            .cornerRadius(StashTheme.Radius.tile)
                    } placeholder: {
                        Rectangle()
                            .fill(StashTheme.Color.surfaceSoft)
                            .frame(width: 180, height: 120)
                            .cornerRadius(StashTheme.Radius.tile)
                            .overlay(
                                ProgressView()
                            )
                    }
                } else {
                    // Emoji fallback
                    Rectangle()
                        .fill(StashTheme.Color.surfaceSoft)
                        .frame(width: 180, height: 120)
                        .cornerRadius(StashTheme.Radius.tile)
                        .overlay(
                            EmojiView(item.primaryEmoji, size: 48)
                        )
                }
            }

            // Title
            Text(item.title.htmlDecoded)
                .font(StashTypography.cardTitle)
                .foregroundColor(StashTheme.Color.textPrimary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)

            // Metadata
            Text(item.sourceLabel)
                .font(StashTypography.caption)
                .foregroundColor(StashTheme.Color.textSecondary)
        }
        .frame(width: 180)
        .padding(12)
        .background(StashTheme.Color.surface)
        .cornerRadius(StashTheme.Radius.card)
        .shadow(
            color: StashTheme.Shadow.subtle.color,
            radius: StashTheme.Shadow.subtle.radius,
            x: StashTheme.Shadow.subtle.x,
            y: StashTheme.Shadow.subtle.y
        )
    }
}

#Preview {
    NavigationStack {
        RelatedItemsSection(
            items: ItemSummary.mockItems,
            title: "More like this"
        )
        .background(StashTheme.Color.bg)
    }
}
