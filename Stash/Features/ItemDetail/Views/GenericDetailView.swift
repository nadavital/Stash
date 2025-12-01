import SwiftUI

/// Generic fallback detail view for all item types
struct GenericDetailView: View {
    let item: ItemSummary
    @Environment(\.dismiss) private var dismiss
    @State private var rating: Rating? = nil
    @State private var showLikeEmoji = false
    @State private var showDislikeEmoji = false

    enum Rating {
        case liked
        case disliked
    }

    private let actionsManager = ItemActionsManager.shared

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
        items.append(relativeDate)
        return items
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Hero image bleeding into safe area
                HeroImageView(
                    iconUrl: item.metadata.iconUrl,
                    emoji: item.primaryEmoji,
                    height: StashSpacing.heroArticleHeight,
                    ignoreTopSafeArea: false
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

                        MetadataRow(items: metadataItems)
                    }

                    // Primary action button
                    if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                        Link(destination: url) {
                            HStack(spacing: 8) {
                                Image(systemName: "safari")
                                    .font(.system(size: 16, weight: .semibold))
                                Text("Open Original")
                                    .font(StashTypography.body.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundColor(StashTheme.Color.textPrimary)
                            .background(StashTheme.Color.accent)
                            .cornerRadius(StashTheme.Radius.card)
                        }
                        .buttonStyle(ScaleButtonStyle())
                    }

                    // Summary
                    if !item.summary.isEmpty {
                        AISummaryCard(
                            summary: item.summary,
                            tags: Array(item.metadata.tags.prefix(2))
                        )
                    }
                    
                    // Ask Stash section with suggested prompts
                    AskAboutSection(item: item)

                    // Tags
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
                HStack(spacing: 16) {
                    // Thumbs up
                    Button {
                        Task {
                            if rating == .liked {
                                rating = nil
                            } else {
                                rating = .liked
                                showLikeEmoji = true
                                await likeItem()
                            }
                        }
                    } label: {
                        Image(systemName: rating == .liked ? "hand.thumbsup.fill" : "hand.thumbsup")
                            .font(.system(size: 18))
                    }
                    .emojiPop(isTriggered: $showLikeEmoji, emoji: "👍")

                    // Thumbs down
                    Button {
                        Task {
                            if rating == .disliked {
                                rating = nil
                            } else {
                                rating = .disliked
                                showDislikeEmoji = true
                                await unlikeItem()
                            }
                        }
                    } label: {
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
                            .font(.system(size: 18))
                    }
                }
            }
        }
    }

    private func likeItem() async {
        do {
            try await actionsManager.likeItem(itemId: item.itemId)
        } catch {
            print("🔴 Error liking item: \(error)")
        }
    }

    private func unlikeItem() async {
        do {
            try await actionsManager.unlikeItem(itemId: item.itemId)
        } catch {
            print("�� Error unliking item: \(error)")
        }
    }

    private func deleteItem() async {
        do {
            dismiss()
            try await actionsManager.deleteItem(itemId: item.itemId)
            NotificationCenter.default.post(name: .itemDeleted, object: nil)
        } catch {
            print("🔴 Error deleting item: \(error)")
        }
    }
}

#Preview {
    NavigationStack {
        GenericDetailView(item: .mockArticle)
    }
}
