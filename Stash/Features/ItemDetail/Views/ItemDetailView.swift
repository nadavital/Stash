import SwiftUI

/// Immersive detail view with hero image and glass styling
struct ItemDetailView: View {
    let item: ItemSummary
    var relatedItems: [ItemSummary] = []
    var friends: [Friend] = [] // Would come from FriendsManager
    
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    
    private let actionsManager = ItemActionsManager.shared
    
    var body: some View {
        ZStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    // Hero section with image
                    heroSection
                    
                    // Content section
                    VStack(alignment: .leading, spacing: Spacing.xl) {
                        // Share with friends
                        shareSection
                        
                        // Summary
                        if !item.summary.isEmpty {
                            Text(item.summary)
                                .font(.system(size: 17))
                                .foregroundStyle(StashTheme.Color.textPrimary)
                                .lineSpacing(6)
                        }
                        
                        // From your stash (navigable)
                        if !relatedItems.isEmpty {
                            fromYourStashSection
                        }
                        
                        Spacer().frame(height: 120)
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.xl)
                }
            }
            .background(StashTheme.Color.bg)
            .ignoresSafeArea(edges: .top)
            
            // Bottom control bar - consistent placement
            VStack {
                Spacer()
                DetailControlBar(
                    item: item,
                    primaryActionLabel: primaryActionLabel,
                    primaryActionIcon: primaryActionIcon,
                    onPrimaryAction: {
                        if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                            openURL(url)
                        }
                    },
                    onShare: {
                        showShareSheet = true
                    }
                )
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .detailToolbar(item: item, liked: $liked) { newValue in
            handleLikeChange(newValue)
        }
        .trackEngagement(itemId: item.itemId)
        .sheet(isPresented: $showShareSheet) {
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                ShareSheet(items: [url])
            }
        }
    }
    
    private func handleLikeChange(_ newValue: Bool?) {
        Task {
            if newValue == true {
                await actionsManager.likeItem(itemId: item.itemId)
            } else if newValue == false {
                await actionsManager.dislikeItem(itemId: item.itemId)
            } else if newValue == nil {
                // User toggled off (was liked or disliked, now neutral)
                await actionsManager.unlikeItem(itemId: item.itemId)
            }
        }
    }
    
    // MARK: - Hero Section
    
    private var heroSection: some View {
        ZStack(alignment: .bottomLeading) {
            // Background image or gradient
            GeometryReader { geo in
                heroBackground
                    .frame(width: geo.size.width, height: 320)
            }
            .frame(height: 320)
            
            // Gradient overlay for text
            LinearGradient(
                colors: [.clear, .clear, StashTheme.Color.bg.opacity(0.5), StashTheme.Color.bg],
                startPoint: .top,
                endPoint: .bottom
            )
            
            // Title and metadata
            VStack(alignment: .leading, spacing: Spacing.sm) {
                // Type pill - glass style
                HStack(spacing: 6) {
                    Text(item.primaryEmoji)
                        .font(.system(size: 14))
                    Text(item.type.displayName)
                        .font(.system(size: 12, weight: .semibold))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                
                Text(item.title)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                
                if let source = item.metadata.sourceName {
                    Text(source)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.bottom, Spacing.lg)
        }
    }
    
    @ViewBuilder
    private var heroBackground: some View {
        if let iconUrl = item.metadata.iconUrl, let url = URL(string: iconUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                case .failure, .empty:
                    fallbackGradient
                @unknown default:
                    fallbackGradient
                }
            }
        } else {
            fallbackGradient
        }
    }
    
    private var fallbackGradient: some View {
        ZStack {
            LinearGradient(
                colors: gradientColors(for: item.type),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            // Subtle glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [.white.opacity(0.08), .clear],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: 300
                    )
                )
                .frame(width: 400, height: 400)
                .offset(x: -100, y: -100)
            
            // Large emoji watermark
            Text(item.primaryEmoji)
                .font(.system(size: 120))
                .opacity(0.15)
        }
    }
    
    private func gradientColors(for type: EntityType) -> [Color] {
        switch type {
        case .article:
            return [Color(red: 0.12, green: 0.18, blue: 0.32), Color(red: 0.06, green: 0.08, blue: 0.14)]
        case .song:
            return [Color(red: 0.38, green: 0.18, blue: 0.45), Color(red: 0.18, green: 0.08, blue: 0.25)]
        case .event:
            return [Color(red: 0.18, green: 0.32, blue: 0.42), Color(red: 0.08, green: 0.14, blue: 0.18)]
        case .recipe:
            return [Color(red: 0.45, green: 0.28, blue: 0.18), Color(red: 0.22, green: 0.12, blue: 0.08)]
        case .youtubeVideo, .youtubeShort:
            return [Color(red: 0.5, green: 0.1, blue: 0.1), Color(red: 0.25, green: 0.05, blue: 0.05)]
        case .tiktok, .instagramReel:
            return [Color(red: 0.1, green: 0.1, blue: 0.18), Color(red: 0.04, green: 0.04, blue: 0.08)]
        default:
            return [Color(red: 0.15, green: 0.15, blue: 0.18), Color(red: 0.06, green: 0.06, blue: 0.08)]
        }
    }
    
    // MARK: - Share Section
    
    private var shareSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("Share with")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textMuted)
                .textCase(.uppercase)
                .tracking(0.5)
            
            if friends.isEmpty {
                // Empty state - encourage adding friends
                Button {
                    Haptics.light()
                    // Navigate to friends
                } label: {
                    HStack(spacing: Spacing.md) {
                        ZStack {
                            Circle()
                                .strokeBorder(StashTheme.Color.borderSubtle.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                                .frame(width: 44, height: 44)
                            
                            Image(systemName: "person.badge.plus")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(StashTheme.Color.textMuted)
                        }
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Add friends to share")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(StashTheme.Color.textPrimary)
                            Text("Send items with one tap")
                                .font(.system(size: 13))
                                .foregroundStyle(StashTheme.Color.textMuted)
                        }
                        
                        Spacer()
                        
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(StashTheme.Color.textMuted)
                    }
                    .padding(Spacing.md)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
            } else {
                // Friend avatars for quick share
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.md) {
                        ForEach(friends) { friend in
                            friendShareButton(friend: friend)
                        }
                        
                        // More button
                        Button {
                            Haptics.light()
                            showShareSheet = true
                        } label: {
                            VStack(spacing: 6) {
                                Circle()
                                    .fill(.ultraThinMaterial)
                                    .frame(width: 52, height: 52)
                                    .overlay(
                                        Image(systemName: "ellipsis")
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundStyle(StashTheme.Color.textSecondary)
                                    )
                                
                                Text("More")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(StashTheme.Color.textMuted)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
    
    private func friendShareButton(friend: Friend) -> some View {
        let displayName = friend.name ?? friend.handle
        
        return Button {
            Haptics.medium()
            // Quick share to this friend
        } label: {
            VStack(spacing: 6) {
                // Avatar - use initials since Friend model doesn't have avatarUrl
                initialsAvatar(for: displayName)
                
                Text(displayName.components(separatedBy: " ").first ?? displayName)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(StashTheme.Color.textSecondary)
                    .lineLimit(1)
            }
            .frame(width: 60)
        }
        .buttonStyle(.plain)
    }
    
    private func initialsAvatar(for name: String) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .frame(width: 52, height: 52)
            .overlay(
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textSecondary)
            )
    }
    
    // MARK: - Primary Action Helpers
    
    private var primaryActionIcon: String {
        switch item.type {
        case .article: return "book.fill"
        case .song: return "play.fill"
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel: return "play.fill"
        case .recipe: return "fork.knife"
        case .event: return "calendar"
        default: return "safari"
        }
    }
    
    private var primaryActionLabel: String {
        switch item.type {
        case .article: return "Read"
        case .song: return "Play"
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel: return "Watch"
        case .recipe: return "View Recipe"
        case .event: return "View Event"
        default: return "Open"
        }
    }
    
    // MARK: - From Your Stash
    
    private var fromYourStashSection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            Text("From your stash")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textMuted)
                .textCase(.uppercase)
                .tracking(0.5)
            
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.md) {
                    ForEach(relatedItems) { relatedItem in
                        NavigationLink(value: relatedItem) {
                            relatedItemCard(item: relatedItem)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationDestination(for: ItemSummary.self) { relatedItem in
            ItemDetailRouter(
                item: relatedItem,
                relatedItems: relatedItems.filter { $0.id != relatedItem.id },
                friends: friends
            )
        }
    }
    
    private func relatedItemCard(item: ItemSummary) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            // Image or gradient
            ZStack {
                if let iconUrl = item.metadata.iconUrl, let url = URL(string: iconUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        default:
                            smallGradient(for: item)
                        }
                    }
                } else {
                    smallGradient(for: item)
                }
            }
            .frame(width: 120, height: 80)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(2)
                
                Text(item.type.displayName)
                    .font(.system(size: 11))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            .frame(width: 120, alignment: .leading)
        }
    }
    
    private func smallGradient(for item: ItemSummary) -> some View {
        ZStack {
            LinearGradient(
                colors: gradientColors(for: item.type),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text(item.primaryEmoji)
                .font(.system(size: 32))
                .opacity(0.8)
        }
    }
}

// MARK: - Preview

#Preview("With Image") {
    NavigationStack {
        ItemDetailView(
            item: ItemSummary.mockArticle,
            relatedItems: [ItemSummary.mockSong, ItemSummary.mockEvent, ItemSummary.mockVideo]
        )
    }
}

#Preview("No Related Items") {
    NavigationStack {
        ItemDetailView(item: ItemSummary.mockSong)
    }
}
