import SwiftUI
import AVFoundation

/// Native music detail view with album art and playback
/// - Preview: Album art, artist info, AI summary
/// - Engage: Preview playback (30-sec), full playback via MusicKit/Spotify
/// - Act: Add to playlist, open in music app
struct MusicDetailView: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    
    @State private var liked: Bool? = nil
    @State private var showShareSheet = false
    @State private var isPlaying = false
    @State private var playbackProgress: Double = 0
    @State private var audioPlayer: AVPlayer?
    @State private var timeObserver: Any?
    
    private let actionsManager = ItemActionsManager.shared
    
    // Music metadata
    private var artistName: String {
        item.metadata.artistName ?? "Unknown Artist"
    }
    
    private var albumName: String {
        item.metadata.albumName ?? "Unknown Album"
    }
    
    private var albumArtUrl: String? {
        item.metadata.albumArtUrl ?? item.metadata.iconUrl
    }
    
    private var duration: String {
        if let ms = item.metadata.durationMs {
            let seconds = ms / 1000
            let mins = seconds / 60
            let secs = seconds % 60
            return String(format: "%d:%02d", mins, secs)
        }
        return ""
    }
    
    private var hasPreview: Bool {
        item.metadata.previewUrl != nil
    }
    
    private var musicPlatform: MusicPlatform {
        if item.metadata.appleMusicId != nil {
            return .appleMusic
        } else if item.metadata.spotifyId != nil {
            return .spotify
        }
        // Infer from URL
        if let url = item.canonicalUrl?.lowercased() {
            if url.contains("spotify") { return .spotify }
            if url.contains("apple") || url.contains("music.apple") { return .appleMusic }
            if url.contains("soundcloud") { return .soundcloud }
            if url.contains("youtube") || url.contains("youtu.be") { return .youtube }
        }
        return .appleMusic // Default
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ScrollView {
                    VStack(spacing: 0) {
                        // Album art hero
                        albumArtSection
                        
                        // Content
                        VStack(alignment: .leading, spacing: Spacing.xl) {
                            // Title and artist
                            titleSection
                            
                            // Playback controls (if preview available)
                            if hasPreview {
                                playbackSection
                            }
                            
                            // AI Summary
                            aiSummarySection
                            
                            Spacer().frame(height: 120)
                        }
                        .padding(.horizontal, Spacing.lg)
                        .padding(.top, Spacing.xl)
                    }
                    .frame(width: geometry.size.width)
                }
                .scrollContentBackground(.hidden)
                
                // Bottom control bar - consistent placement
                VStack {
                    Spacer()
                    DetailControlBar(
                        item: item,
                        primaryActionLabel: "Play",
                        primaryActionIcon: "play.fill",
                        onPrimaryAction: {
                            openInMusicApp()
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
        .detailToolbar(item: item, liked: $liked) { newValue in
            handleLikeChange(newValue)
        }
        .trackEngagement(itemId: item.itemId)
        .sheet(isPresented: $showShareSheet) {
            if let urlString = item.canonicalUrl, let url = URL(string: urlString) {
                ShareSheet(items: [url])
            }
        }
        .onDisappear {
            stopPlayback()
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
    
    private func openInMusicApp() {
        guard let urlString = item.canonicalUrl, let url = URL(string: urlString) else { return }
        openURL(url)
    }
    
    // MARK: - Album Art Section
    
    private var albumArtSection: some View {
        ZStack {
            // Blurred background
            if let artUrl = albumArtUrl, let url = URL(string: artUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 400)
                            .clipped()
                            .blur(radius: 50)
                            .opacity(0.6)
                    default:
                        musicGradient
                    }
                }
            } else {
                musicGradient
            }
            
            // Gradient overlay
            LinearGradient(
                colors: [.clear, StashTheme.Color.bg.opacity(0.5), StashTheme.Color.bg],
                startPoint: .top,
                endPoint: .bottom
            )
            
            // Album art
            VStack {
                Spacer().frame(height: 60)
                
                if let artUrl = albumArtUrl, let url = URL(string: artUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 240, height: 240)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .shadow(color: .black.opacity(0.4), radius: 20, y: 10)
                        case .empty, .failure:
                            albumArtPlaceholder
                        @unknown default:
                            albumArtPlaceholder
                        }
                    }
                    .frame(width: 240, height: 240)
                } else {
                    albumArtPlaceholder
                }
                
                Spacer().frame(height: 40)
            }
        }
        .frame(height: 360)
    }
    
    private var musicGradient: some View {
        LinearGradient(
            colors: [Color.accentColor.opacity(0.4), Color.accentColor.opacity(0.1), StashTheme.Color.bg],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 400)
    }
    
    private var albumArtPlaceholder: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(
                LinearGradient(
                    colors: [Color.accentColor.opacity(0.3), Color.accentColor.opacity(0.1)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 240, height: 240)
            .overlay(
                Text(item.primaryEmoji)
                    .font(.system(size: 80))
            )
            .shadow(color: .black.opacity(0.3), radius: 20, y: 10)
    }
    
    // MARK: - Title Section
    
    private var titleSection: some View {
        VStack(alignment: .center, spacing: Spacing.sm) {
            Text(item.title)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(StashTheme.Color.textPrimary)
                .multilineTextAlignment(.center)
            
            Text(artistName)
                .font(.system(size: 17))
                .foregroundStyle(StashTheme.Color.textSecondary)
            
            HStack(spacing: Spacing.md) {
                Text(albumName)
                    .font(.system(size: 14))
                    .foregroundStyle(StashTheme.Color.textMuted)
                
                if !duration.isEmpty {
                    Text("•")
                        .foregroundStyle(StashTheme.Color.textMuted)
                    Text(duration)
                        .font(.system(size: 14))
                        .foregroundStyle(StashTheme.Color.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
    
    // MARK: - Playback Section
    
    private var playbackSection: some View {
        VStack(spacing: Spacing.md) {
            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Background track
                    Capsule()
                        .fill(StashTheme.Color.surface)
                        .frame(height: 4)
                    
                    // Progress
                    Capsule()
                        .fill(Color.accentColor)
                        .frame(width: geo.size.width * playbackProgress, height: 4)
                }
            }
            .frame(height: 4)
            
            // Play/Pause button
            HStack(spacing: Spacing.xl) {
                Spacer()
                
                // Previous (disabled, for visual balance)
                Image(systemName: "backward.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(StashTheme.Color.textMuted.opacity(0.5))
                
                // Play/Pause
                Button {
                    Haptics.medium()
                    togglePlayback()
                } label: {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 64, height: 64)
                        .overlay(
                            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 24))
                                .foregroundStyle(.white)
                                .offset(x: isPlaying ? 0 : 2)
                        )
                        .shadow(color: Color.accentColor.opacity(0.4), radius: 10, y: 4)
                }
                .buttonStyle(.plain)
                
                // Next (disabled, for visual balance)
                Image(systemName: "forward.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(StashTheme.Color.textMuted.opacity(0.5))
                
                Spacer()
            }
            
            // Preview label
            Text("30-second preview")
                .font(.system(size: 12))
                .foregroundStyle(StashTheme.Color.textMuted)
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    
    // MARK: - AI Summary
    
    private var aiSummarySection: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            HStack(spacing: 8) {
                SynapseLensIcon(size: 20)
                Text("About this track")
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
    
    // MARK: - Playback
    
    private func togglePlayback() {
        if isPlaying {
            stopPlayback()
        } else {
            startPlayback()
        }
    }
    
    private func startPlayback() {
        guard let previewUrlString = item.metadata.previewUrl,
              let url = URL(string: previewUrlString) else { return }
        
        let playerItem = AVPlayerItem(url: url)
        audioPlayer = AVPlayer(playerItem: playerItem)
        
        // Observe playback progress
        let interval = CMTime(seconds: 0.1, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = audioPlayer?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
            guard let duration = audioPlayer?.currentItem?.duration,
                  duration.seconds > 0 else { return }
            
            playbackProgress = time.seconds / duration.seconds
            
            // Auto-stop at end
            if playbackProgress >= 0.99 {
                stopPlayback()
            }
        }
        
        audioPlayer?.play()
        isPlaying = true
    }
    
    private func stopPlayback() {
        if let observer = timeObserver {
            audioPlayer?.removeTimeObserver(observer)
            timeObserver = nil
        }
        audioPlayer?.pause()
        audioPlayer = nil
        isPlaying = false
        playbackProgress = 0
    }
    
    // MARK: - Open in Music App
    
    private var hasAppleMusicLink: Bool {
        // Check for Apple Music ID or URL containing apple music
        if item.metadata.appleMusicId != nil { return true }
        if let url = item.canonicalUrl?.lowercased() {
            if url.contains("music.apple.com") || url.contains("apple.com/music") { return true }
        }
        return false
    }
    
    private var hasSpotifyLink: Bool {
        // Check for Spotify ID or URL containing spotify
        if item.metadata.spotifyId != nil { return true }
        if let url = item.canonicalUrl?.lowercased() {
            if url.contains("spotify.com") || url.contains("open.spotify") { return true }
        }
        return false
    }
    
    private func openInAppleMusic() {
        // Try Apple Music deep link first
        if let id = item.metadata.appleMusicId {
            if let url = URL(string: "music://music.apple.com/song/\(id)") {
                openURL(url)
                return
            }
        }
        // Fall back to canonical URL if it's an Apple Music URL
        if let urlString = item.canonicalUrl,
           urlString.lowercased().contains("apple"),
           let url = URL(string: urlString) {
            openURL(url)
        }
    }
    
    private func openInSpotify() {
        // Try Spotify deep link first
        if let id = item.metadata.spotifyId {
            if let url = URL(string: "spotify:track:\(id)") {
                openURL(url)
                return
            }
        }
        // Fall back to canonical URL if it's a Spotify URL
        if let urlString = item.canonicalUrl,
           urlString.lowercased().contains("spotify"),
           let url = URL(string: urlString) {
            openURL(url)
        }
    }
}

// MARK: - Music Platform

enum MusicPlatform {
    case appleMusic
    case spotify
    case soundcloud
    case youtube
    
    var displayName: String {
        switch self {
        case .appleMusic: return "Apple Music"
        case .spotify: return "Spotify"
        case .soundcloud: return "SoundCloud"
        case .youtube: return "YouTube Music"
        }
    }
    
    var appName: String {
        switch self {
        case .appleMusic: return "Apple Music"
        case .spotify: return "Spotify"
        case .soundcloud: return "SoundCloud"
        case .youtube: return "YouTube"
        }
    }
    
    var icon: Image {
        switch self {
        case .appleMusic: return Image(systemName: "music.note")
        case .spotify: return Image(systemName: "music.note.list")
        case .soundcloud: return Image(systemName: "cloud")
        case .youtube: return Image(systemName: "play.rectangle.fill")
        }
    }
    
    var color: Color {
        switch self {
        case .appleMusic: return Color(red: 0.98, green: 0.24, blue: 0.35) // Apple Music pink/red
        case .spotify: return Color(red: 0.12, green: 0.84, blue: 0.38) // Spotify green
        case .soundcloud: return Color(red: 1, green: 0.33, blue: 0) // SoundCloud orange
        case .youtube: return Color(red: 1, green: 0, blue: 0) // YouTube red
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        MusicDetailView(item: .mockSong)
    }
}
