import SwiftUI
import WebKit

/// Detail view specifically for articles with reader mode option
struct ArticleDetailView: View {
    let item: ItemSummary
    @Environment(\.dismiss) private var dismiss
    @State private var showReaderMode = false
    @State private var rating: Rating? = nil
    @State private var showLikeEmoji = false
    @State private var showDislikeEmoji = false

    enum Rating {
        case liked
        case disliked
    }

    private let actionsManager = ItemActionsManager.shared

    // Calculate reading time (rough estimate: 200 words per minute)
    private var readingTime: String? {
        let words = item.summary.split(separator: " ").count
        let minutes = max(1, words / 200)
        return "\(minutes) min read"
    }

    // Format date relative to now
    private var relativeDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: item.createdAt, relativeTo: Date())
    }

    // Metadata items for display
    private var metadataItems: [String] {
        var items: [String] = []

        if item.sourceLabel.contains("FRIEND") {
            items.append("Shared by @friend")
        }

        if let readingTime = readingTime {
            items.append(readingTime)
        }

        items.append(relativeDate)

        return items
    }
    
    // AI context tags for the summary card
    private var aiContextTags: [String] {
        var tags: [String] = []
        if let readingTime = readingTime {
            tags.append(readingTime)
        }
        if !item.metadata.tags.isEmpty {
            tags.append(contentsOf: item.metadata.tags.prefix(2))
        }
        return tags
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Hero image bleeding into safe area
                HeroImageView(
                    iconUrl: item.metadata.iconUrl,
                    emoji: item.primaryEmoji,
                    height: StashSpacing.heroArticleHeight,
                    ignoreTopSafeArea: true
                )

                // Content section
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 12) {
                        SourceLabel(label: item.sourceLabel)

                        Text(item.title.htmlDecoded)
                            .font(StashTypography.pageTitle)
                            .foregroundColor(StashTheme.Color.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        MetadataRow(items: metadataItems)
                    }

                    // Primary action - Read Article
                    if let urlString = item.canonicalUrl, let _ = URL(string: urlString) {
                        PrimaryActionButton(
                            title: "Read Article",
                            icon: "book.fill"
                        ) {
                            showReaderMode = true
                            trackReadAction()
                        }
                    }

                    // AI Summary Card
                    if !item.summary.isEmpty {
                        AISummaryCard(
                            summary: item.summary,
                            tags: aiContextTags
                        )
                    }
                    
                    // Ask Stash section with suggested prompts
                    AskAboutSection(item: item)

                    // Content tags
                    if !item.metadata.tags.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Topics")
                                .font(StashTypography.caption)
                                .foregroundColor(StashTheme.Color.textMuted)
                            
                            FlowLayout(spacing: 8) {
                                ForEach(item.metadata.tags.prefix(8), id: \.self) { tag in
                                    TagPill(text: tag)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, StashSpacing.screenHorizontal)
                .padding(.top, 20)

                // Share with friends section
                ShareWithFriendsSection(item: item)

                // Bottom spacing for tab bar
                Color.clear.frame(height: 100)
            }
        }
        .ignoresSafeArea(edges: .top)
        .background(StashTheme.Color.bg)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 12) {
                    // Thumbs up
                    Button(action: {
                        Task {
                            if rating == .liked {
                                rating = nil
                            } else {
                                rating = .liked
                                showLikeEmoji = true
                                await likeItem()
                            }
                        }
                    }) {
                        Image(systemName: rating == .liked ? "hand.thumbsup.fill" : "hand.thumbsup")
                            .font(.system(size: 18))
                    }
                    .emojiPop(isTriggered: $showLikeEmoji, emoji: "👍")

                    // Thumbs down
                    Button(action: {
                        Task {
                            if rating == .disliked {
                                rating = nil
                            } else {
                                rating = .disliked
                                showDislikeEmoji = true
                                await unlikeItem()
                            }
                        }
                    }) {
                        Image(systemName: rating == .disliked ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                            .font(.system(size: 18))
                    }
                    .emojiPop(isTriggered: $showDislikeEmoji, emoji: "👎")

                    // More menu
                    Menu {
                        Button(role: .destructive, action: {
                            Task {
                                await deleteItem()
                            }
                        }) {
                            Label("Delete from stash", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showReaderMode) {
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                ArticleReaderView(url: url, title: item.title.htmlDecoded)
            }
        }
    }

    private func likeItem() async {
        await actionsManager.likeItem(itemId: item.itemId)
    }

    private func unlikeItem() async {
        await actionsManager.unlikeItem(itemId: item.itemId)
    }

    private func deleteItem() async {
        dismiss()
        await actionsManager.deleteItem(itemId: item.itemId)
    }

    private func trackReadAction() {
        actionsManager.trackEngagement(itemId: item.itemId, action: "read")
    }
}

#Preview {
    NavigationStack {
        ArticleDetailView(item: .mockArticle)
    }
}
