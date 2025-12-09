import SwiftUI
import WebKit

/// Native social post detail view for tweets, threads, and instagram posts
/// - Preview: Native render with author, text, media, metrics
/// - Engage: Embedded post with interactions (oEmbed)
/// - Act: Deep link to native app for interactions
struct SocialPostDetailView: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    @State private var showFullPost = false
    
    private let actionsManager = ItemActionsManager.shared
    
    // Platform detection
    private var platform: SocialPlatform {
        switch item.type {
        case .tweet: return .twitter
        case .threadsPost: return .threads
        case .instagramPost: return .instagram
        default: return .twitter
        }
    }
    
    // Mock data - would come from enriched metadata
    private var authorName: String {
        item.metadata.authorName ?? "Author"
    }
    
    private var authorHandle: String {
        item.metadata.authorHandle ?? "@handle"
    }
    
    private var postText: String {
        // Use summary as the post text if we extracted it during enrichment
        item.summary
    }
    
    private var likeCount: Int {
        item.metadata.likeCount ?? 0
    }
    
    private var repostCount: Int {
        item.metadata.repostCount ?? 0
    }
    
    private var mediaUrls: [String] {
        item.metadata.mediaUrls ?? []
    }
    
    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Platform header
                    platformHeader
                    
                    // Main content
                    VStack(alignment: .leading, spacing: Spacing.xl) {
                        // Author info
                        authorSection
                        
                        // Post content
                        postContentSection
                        
                        // Media (if any)
                        if !mediaUrls.isEmpty {
                            mediaSection
                        }
                        
                        // Engagement metrics
                        metricsSection
                        
                        Spacer().frame(height: 120)
                    }
                    .padding(.horizontal, Spacing.lg)
                    .padding(.top, Spacing.lg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity)
            }
            .scrollContentBackground(.hidden)
            
            // Bottom control bar - consistent placement
            VStack {
                Spacer()
                DetailControlBar(
                    item: item,
                    primaryActionLabel: "Open in \(platform.appName)",
                    primaryActionIcon: "arrow.up.right",
                    onPrimaryAction: {
                        openInNativeApp()
                    },
                    onShare: {
                        showShareSheet = true
                    }
                )
            }
        }
        .background(StashTheme.Color.bg)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    platform.icon
                        .font(.system(size: 16, weight: .semibold))
                    Text(platform.displayName)
                        .font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(platform.color)
            }
        }
        .detailToolbar(item: item, liked: $liked) { newValue in
            handleLikeChange(newValue)
        }
        .trackEngagement(itemId: item.itemId)
        .sheet(isPresented: $showFullPost) {
            NavigationStack {
                ContentDetailView(item: item)
            }
        }
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
            } else if newValue == nil {
                await actionsManager.unlikeItem(itemId: item.itemId)
            }
        }
    }
    
    // MARK: - Platform Header
    
    private var platformHeader: some View {
        ZStack {
            // Subtle gradient background
            LinearGradient(
                colors: [platform.color.opacity(0.15), platform.color.opacity(0.05), .clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 100)
        }
    }
    
    // MARK: - Author Section
    
    private var authorSection: some View {
        HStack(spacing: Spacing.md) {
            // Avatar
            if let avatarUrl = item.metadata.authorAvatarUrl, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    default:
                        avatarPlaceholder
                    }
                }
                .frame(width: 48, height: 48)
                .clipShape(Circle())
            } else {
                avatarPlaceholder
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(authorName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                
                Text(authorHandle)
                    .font(.system(size: 14))
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            
            Spacer()
            
            // Platform logo/verification
            platform.icon
                .font(.system(size: 20))
                .foregroundStyle(platform.color)
        }
    }
    
    private var avatarPlaceholder: some View {
        Circle()
            .fill(platform.color.opacity(0.2))
            .frame(width: 48, height: 48)
            .overlay(
                Text(String(authorName.prefix(1)).uppercased())
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(platform.color)
            )
    }
    
    // MARK: - Post Content
    
    private var postContentSection: some View {
        Text(postText)
            .font(.system(size: 18))
            .foregroundStyle(StashTheme.Color.textPrimary)
            .lineSpacing(6)
    }
    
    // MARK: - Media Section
    
    private var mediaSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.md) {
                ForEach(mediaUrls, id: \.self) { urlString in
                    if let url = URL(string: urlString) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 280, height: 200)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            case .failure:
                                mediaPlaceholder
                            case .empty:
                                mediaPlaceholder
                                    .overlay(ProgressView())
                            @unknown default:
                                mediaPlaceholder
                            }
                        }
                    }
                }
            }
        }
    }
    
    private var mediaPlaceholder: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(StashTheme.Color.surface)
            .frame(width: 280, height: 200)
    }
    
    // MARK: - Metrics
    
    private var metricsSection: some View {
        HStack(spacing: Spacing.xl) {
            MetricItem(icon: "heart", value: formatCount(likeCount), label: "Likes")
            MetricItem(icon: "arrow.2.squarepath", value: formatCount(repostCount), label: "Reposts")
            
            Spacer()
            
            // Timestamp
            Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                .font(.system(size: 13))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .padding(.vertical, Spacing.md)
        .padding(.horizontal, Spacing.lg)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    
    // MARK: - Helpers
    
    private func formatCount(_ count: Int) -> String {
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1000 {
            return String(format: "%.1fK", Double(count) / 1000)
        }
        return "\(count)"
    }
    
    private func openInNativeApp() {
        guard let urlString = item.canonicalUrl else { return }
        
        // Try to open in native app via deep link
        let deepLink: URL?
        
        switch platform {
        case .twitter:
            // twitter://status?id=123456789
            if let tweetId = extractTweetId(from: urlString) {
                deepLink = URL(string: "twitter://status?id=\(tweetId)")
            } else {
                deepLink = URL(string: urlString)
            }
        case .threads:
            // Threads doesn't have great deep linking yet
            deepLink = URL(string: urlString)
        case .instagram:
            // instagram://media?id=123456789
            deepLink = URL(string: urlString)
        }
        
        if let url = deepLink {
            openURL(url)
        }
    }
    
    private func extractTweetId(from urlString: String) -> String? {
        // Extract tweet ID from URLs like https://twitter.com/user/status/123456789
        let pattern = #"/status/(\d+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: urlString, range: NSRange(urlString.startIndex..., in: urlString)),
              let range = Range(match.range(at: 1), in: urlString) else {
            return nil
        }
        return String(urlString[range])
    }
}

// MARK: - Social Platform

enum SocialPlatform {
    case twitter
    case threads
    case instagram
    
    var displayName: String {
        switch self {
        case .twitter: return "X"
        case .threads: return "Threads"
        case .instagram: return "Instagram"
        }
    }
    
    var appName: String {
        switch self {
        case .twitter: return "X"
        case .threads: return "Threads"
        case .instagram: return "Instagram"
        }
    }
    
    var icon: Image {
        switch self {
        case .twitter: return Image(systemName: "bird")
        case .threads: return Image(systemName: "at.circle")
        case .instagram: return Image(systemName: "camera.circle")
        }
    }
    
    var color: Color {
        switch self {
        case .twitter: return Color(red: 0.1, green: 0.1, blue: 0.1) // X black
        case .threads: return Color(red: 0.1, green: 0.1, blue: 0.1) // Threads black
        case .instagram: return Color(red: 0.88, green: 0.19, blue: 0.42) // Instagram pink
        }
    }
}

// MARK: - Metric Item

struct MetricItem: View {
    let icon: String
    let value: String
    let label: String
    
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(StashTheme.Color.textMuted)
            
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(StashTheme.Color.textPrimary)
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        SocialPostDetailView(item: .mockTweet)
    }
}
