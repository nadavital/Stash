import SwiftUI
import WebKit

/// Native video detail view with embedded player
/// - Preview: Thumbnail, AI summary, duration
/// - Engage: Embedded player (YouTube iframe, etc.)
/// - Act: Share timestamp, add to Watch Later (future)
struct VideoDetailView: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    @State private var isPlaying = false
    
    private let actionsManager = ItemActionsManager.shared
    
    // Video metadata
    private var videoId: String? {
        item.metadata.videoId ?? extractVideoId(from: item.canonicalUrl)
    }
    
    private var platform: VideoPlatform {
        if let p = item.metadata.videoPlatform {
            return VideoPlatform(rawValue: p) ?? .youtube
        }
        switch item.type {
        case .youtubeVideo, .youtubeShort: return .youtube
        case .tiktok: return .tiktok
        case .instagramReel: return .instagram
        default: return .youtube
        }
    }
    
    private var isVertical: Bool {
        item.type == .youtubeShort || item.type == .tiktok || item.type == .instagramReel
    }
    
    private var duration: String {
        if let seconds = item.metadata.durationSeconds {
            let mins = seconds / 60
            let secs = seconds % 60
            return String(format: "%d:%02d", mins, secs)
        }
        return ""
    }
    
    var body: some View {
        GeometryReader { geo in
            ZStack {
                ScrollView {
                    VStack(spacing: 0) {
                        // Video player area
                        videoPlayerSection(width: geo.size.width)
                        
                        // Content
                        VStack(alignment: .leading, spacing: Spacing.xl) {
                            // Title and source
                            titleSection
                            
                            // AI Summary
                            aiSummarySection
                            
                            Spacer().frame(height: 120)
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.top, Spacing.xl)
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
                        primaryActionIcon: "play.fill",
                        onPrimaryAction: {
                            openInNativeApp()
                        },
                        onShare: {
                            showShareSheet = true
                        }
                    )
                }
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
    
    // MARK: - Video Player Section
    
    @ViewBuilder
    private func videoPlayerSection(width: CGFloat) -> some View {
        let height = isVertical ? width * 16/9 : width * 9/16
        
        ZStack {
            if isPlaying, let videoId = videoId {
                // Embedded player
                VideoEmbedView(videoId: videoId, platform: platform)
                    .frame(width: width, height: height)
            } else {
                // Thumbnail with play button
                thumbnailView(width: width, height: height)
            }
        }
        .frame(width: width, height: height)
        .background(Color.black)
    }
    
    private func thumbnailView(width: CGFloat, height: CGFloat) -> some View {
        ZStack {
            // Thumbnail image
            if let thumbnailUrl = item.metadata.thumbnailUrl ?? item.metadata.iconUrl,
               let url = URL(string: thumbnailUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: width, height: height)
                            .clipped()
                    default:
                        thumbnailPlaceholder
                    }
                }
            } else {
                thumbnailPlaceholder
            }
            
            // Play button overlay
            Button {
                Haptics.medium()
                withAnimation {
                    isPlaying = true
                }
            } label: {
                Circle()
                    .fill(.black.opacity(0.6))
                    .frame(width: 72, height: 72)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(.white)
                            .offset(x: 2) // Visual centering
                    )
            }
            .buttonStyle(.plain)
            
            // Duration badge
            if !duration.isEmpty {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(duration)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.7))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .padding(Spacing.md)
                    }
                }
            }
        }
    }
    
    private var thumbnailPlaceholder: some View {
        ZStack {
            LinearGradient(
                colors: [platform.color.opacity(0.3), platform.color.opacity(0.1)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            Text(item.primaryEmoji)
                .font(.system(size: 60))
                .opacity(0.5)
        }
    }
    
    // MARK: - Title Section
    
    private var titleSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(item.title)
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(StashTheme.Color.textPrimary)
            
            HStack(spacing: Spacing.md) {
                if let source = item.metadata.sourceName {
                    Text(source)
                        .font(.system(size: 14))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
                
                if !duration.isEmpty {
                    Text("•")
                        .foregroundStyle(StashTheme.Color.textMuted)
                    Text(duration)
                        .font(.system(size: 14))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
        }
    }
    
    // MARK: - AI Summary
    
    private var aiSummarySection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: 8) {
                SynapseLensIcon(size: 20)
                Text("Stash Summary")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textMuted)
                    .textCase(.uppercase)
                    .tracking(0.5)
            }
            
            Text(item.summary)
                .font(.system(size: 16))
                .foregroundStyle(StashTheme.Color.textPrimary)
                .lineSpacing(5)
        }
        .padding(Spacing.lg)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }
    
    // MARK: - Helpers
    
    private func extractVideoId(from urlString: String?) -> String? {
        guard let urlString = urlString else { return nil }
        
        // YouTube: youtube.com/watch?v=ID or youtu.be/ID
        if urlString.contains("youtube.com") || urlString.contains("youtu.be") {
            if let range = urlString.range(of: "v=") {
                let start = range.upperBound
                let end = urlString[start...].firstIndex(of: "&") ?? urlString.endIndex
                return String(urlString[start..<end])
            }
            if urlString.contains("youtu.be/") {
                if let range = urlString.range(of: "youtu.be/") {
                    let start = range.upperBound
                    let end = urlString[start...].firstIndex(of: "?") ?? urlString.endIndex
                    return String(urlString[start..<end])
                }
            }
        }
        
        return nil
    }
    
    private func openInNativeApp() {
        guard let urlString = item.canonicalUrl, let url = URL(string: urlString) else { return }
        openURL(url)
    }
}

// MARK: - Video Platform

enum VideoPlatform: String {
    case youtube
    case tiktok
    case instagram
    
    var displayName: String {
        switch self {
        case .youtube: return "YouTube"
        case .tiktok: return "TikTok"
        case .instagram: return "Instagram"
        }
    }
    
    var appName: String {
        switch self {
        case .youtube: return "YouTube"
        case .tiktok: return "TikTok"
        case .instagram: return "Instagram"
        }
    }
    
    var icon: Image {
        switch self {
        case .youtube: return Image(systemName: "play.rectangle.fill")
        case .tiktok: return Image(systemName: "music.note")
        case .instagram: return Image(systemName: "camera.circle")
        }
    }
    
    var color: Color {
        switch self {
        case .youtube: return Color(red: 1, green: 0, blue: 0) // YouTube red
        case .tiktok: return Color(red: 0.1, green: 0.1, blue: 0.1) // TikTok black
        case .instagram: return Color(red: 0.88, green: 0.19, blue: 0.42) // Instagram pink
        }
    }
}

// MARK: - Video Embed View

struct VideoEmbedView: UIViewRepresentable {
    let videoId: String
    let platform: VideoPlatform
    
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        let embedHtml: String
        
        switch platform {
        case .youtube:
            embedHtml = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    * { margin: 0; padding: 0; }
                    body { background: #000; }
                    iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
                </style>
            </head>
            <body>
                <iframe 
                    src="https://www.youtube.com/embed/\(videoId)?autoplay=1&playsinline=1&rel=0&modestbranding=1"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
                </iframe>
            </body>
            </html>
            """
        case .tiktok:
            embedHtml = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>* { margin: 0; padding: 0; background: #000; }</style>
            </head>
            <body>
                <blockquote class="tiktok-embed" data-video-id="\(videoId)">
                    <script async src="https://www.tiktok.com/embed.js"></script>
                </blockquote>
            </body>
            </html>
            """
        case .instagram:
            embedHtml = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>* { margin: 0; padding: 0; background: #000; }</style>
            </head>
            <body>
                <p>Instagram embed not available</p>
            </body>
            </html>
            """
        }
        
        webView.loadHTMLString(embedHtml, baseURL: nil)
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        VideoDetailView(item: .mockVideo)
    }
}
