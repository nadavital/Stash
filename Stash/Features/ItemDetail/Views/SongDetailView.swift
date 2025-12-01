import SwiftUI

/// Detail view specifically for songs with music app deep links
struct SongDetailView: View {
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

    // Extract artist from tags or metadata
    private var artist: String? {
        item.metadata.tags.first
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

        if let artist = artist {
            items.append(artist)
        }

        items.append(relativeDate)

        return items
    }

    // Deep link URLs for music apps
    private var appleMusicURL: URL? {
        guard let urlString = item.canonicalUrl else { return nil }
        if urlString.contains("music.apple.com") {
            return URL(string: urlString)
        }
        return nil
    }

    private var spotifyURL: URL? {
        guard let urlString = item.canonicalUrl else { return nil }
        if urlString.contains("spotify.com") || urlString.contains("open.spotify.com") {
            return URL(string: urlString)
        }
        return nil
    }

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Album art - bleeding into safe area
                HeroImageView(
                    iconUrl: item.metadata.iconUrl,
                    emoji: item.primaryEmoji,
                    height: StashSpacing.heroSongHeight,
                    ignoreTopSafeArea: true
                )
                .overlay(
                    // Light gradient for songs
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color.black.opacity(0.0), location: 0.0),
                            .init(color: Color.black.opacity(0.15), location: 0.5),
                            .init(color: Color.black.opacity(0.3), location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: StashSpacing.heroSongHeight * 0.5),
                    alignment: .bottom
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

                    // Primary action - music service button
                    if let url = appleMusicURL {
                        Link(destination: url) {
                            HStack(spacing: 8) {
                                Image(systemName: "music.note")
                                    .font(.system(size: 16, weight: .semibold))
                                Text("Play on Apple Music")
                                    .font(StashTypography.body.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundColor(StashTheme.Color.textPrimary)
                            .background(StashTheme.Color.accent)
                            .cornerRadius(StashTheme.Radius.button)
                        }
                        .buttonStyle(ScaleButtonStyle())
                        .simultaneousGesture(TapGesture().onEnded {
                            trackPlayAction()
                        })
                    } else if let url = spotifyURL {
                        Link(destination: url) {
                            HStack(spacing: 8) {
                                Image(systemName: "music.note.list")
                                    .font(.system(size: 16, weight: .semibold))
                                Text("Play on Spotify")
                                    .font(StashTypography.body.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .foregroundColor(.white)
                            .background(Color(red: 0.11, green: 0.73, blue: 0.33))
                            .cornerRadius(StashTheme.Radius.button)
                        }
                        .buttonStyle(ScaleButtonStyle())
                        .simultaneousGesture(TapGesture().onEnded {
                            trackPlayAction()
                        })
                    } else if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
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
                            .cornerRadius(StashTheme.Radius.button)
                        }
                        .buttonStyle(ScaleButtonStyle())
                        .simultaneousGesture(TapGesture().onEnded {
                            trackPlayAction()
                        })
                    }

                    // Summary
                    if !item.summary.isEmpty {
                        ExpandableText(text: item.summary, lineLimit: 6)
                    }
                    
                    // Ask Stash section with suggested prompts
                    AskAboutSection(item: item)

                    // Tags
                    if !item.metadata.tags.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Vibes")
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

    private func trackPlayAction() {
        actionsManager.trackEngagement(itemId: item.itemId, action: "play")
    }
}

#Preview {
    NavigationStack {
        SongDetailView(item: .mockSong)
    }
}
