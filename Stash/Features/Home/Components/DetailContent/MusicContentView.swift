import SwiftUI

/// Music detail view with album art, metadata, and cross-service integration
/// Supports Spotify and Apple Music deep links for maximum user flexibility
struct MusicContentView: View {
    let item: ItemSummary

    // Extract music metadata
    // Fallback chain: typeMetadata.albumArtUrl (Spotify/Apple Music API) → iconUrl (scraped)
    // Prefer API album art since it's high quality from official sources
    private var albumArtUrl: String? {
        item.metadata.typeMetadata?.albumArtUrl ?? item.metadata.iconUrl
    }
    private var artistName: String? { item.metadata.typeMetadata?.artistName }
    private var albumName: String? { item.metadata.typeMetadata?.albumName }
    private var spotifyId: String? { item.metadata.typeMetadata?.spotifyId }
    private var appleMusicId: String? { item.metadata.typeMetadata?.appleMusicId }
    private var previewUrl: String? { item.metadata.typeMetadata?.previewUrl }
    private var durationMs: Int? { item.metadata.typeMetadata?.durationMs }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Full-bleed album art with blur backdrop
                albumArtSection

                // Metadata and buttons
                VStack(spacing: 24) {
                    metadataSection
                    actionButtonsSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 40)
            }
        }
    }

    // MARK: - Album Art Section

    private var albumArtSection: some View {
        GeometryReader { geometry in
            let width = geometry.size.width

            albumArtContent(width: width)
        }
        .frame(height: 500)
    }

    private func albumArtContent(width: CGFloat) -> some View {
        ZStack(alignment: .bottom) {
            // Full-bleed blurred backdrop
            if let albumArtUrl, let url = URL(string: albumArtUrl) {
                CachedAsyncImage(url: url) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: width, height: 500)
                        .blur(radius: 50)
                        .opacity(0.6)
                } placeholder: {
                    Rectangle()
                        .fill(LinearGradient(
                            colors: [
                                Color(red: 0.9, green: 0.5, blue: 0.1),
                                Color(red: 0.1, green: 0.1, blue: 0.1)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        ))
                        .frame(width: width, height: 500)
                }
            } else {
                Rectangle()
                    .fill(LinearGradient(
                        colors: [
                            Color(red: 0.9, green: 0.5, blue: 0.1),
                            Color(red: 0.1, green: 0.1, blue: 0.1)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ))
                    .frame(width: width, height: 500)
            }

            // Large album art centered
            if let albumArtUrl, let url = URL(string: albumArtUrl) {
                CachedAsyncImage(url: url) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: width * 0.85, height: width * 0.85)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .shadow(color: .black.opacity(0.5), radius: 30, y: 15)
                } placeholder: {
                    ZStack {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color.gray.opacity(0.2))
                            .frame(width: width * 0.85, height: width * 0.85)

                        Image(systemName: "music.note")
                            .font(.system(size: 100))
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.bottom, 40)
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color.gray.opacity(0.2))
                        .frame(width: width * 0.85, height: width * 0.85)

                    VStack(spacing: 12) {
                        Image(systemName: "music.note")
                            .font(.system(size: 100))
                            .foregroundStyle(.tertiary)

                        Text("No Album Art")
                            .font(.system(size: 15))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .frame(width: width, height: 500)
        .clipped()
    }

    // MARK: - Metadata Section

    private var metadataSection: some View {
        VStack(spacing: 12) {
            // Song title
            Text(item.title)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            // Artist name
            if let artist = artistName {
                Text(artist)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            // Album name
            if let album = albumName {
                Text(album)
                    .font(.system(size: 16))
                    .foregroundStyle(.tertiary)
            }

            // Duration
            if let duration = durationMs {
                let minutes = duration / 60000
                let seconds = (duration % 60000) / 1000
                Text(String(format: "%d:%02d", minutes, seconds))
                    .font(.system(size: 14))
                    .foregroundStyle(.quaternary)
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Action Buttons Section

    private var actionButtonsSection: some View {
        VStack(spacing: 16) {
            // Horizontal buttons for Spotify + Apple Music
            if spotifyId != nil || appleMusicId != nil {
                HStack(spacing: 12) {
                    // Spotify button
                    if let spotifyId {
                        Button {
                            openSpotify(trackId: spotifyId)
                        } label: {
                            VStack(spacing: 8) {
                                Image(systemName: "play.circle.fill")
                                    .font(.system(size: 32))
                                    .foregroundStyle(Color(red: 0.11, green: 0.73, blue: 0.33))
                                Text("Spotify")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.primary)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 90)
                        }
                        .glassEffect(.regular, in: .rect(cornerRadius: 16))
                    }

                    // Apple Music button
                    if let appleMusicId {
                        Button {
                            openAppleMusic(trackId: appleMusicId)
                        } label: {
                            VStack(spacing: 8) {
                                Image(systemName: "music.note")
                                    .font(.system(size: 32))
                                    .foregroundStyle(Color(red: 0.98, green: 0.26, blue: 0.42))
                                Text("Apple Music")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.primary)
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 90)
                        }
                        .glassEffect(.regular, in: .rect(cornerRadius: 16))
                    }
                }
            }

            // Fallback: Open web link
            if spotifyId == nil && appleMusicId == nil, let canonicalUrl = item.canonicalUrl {
                Button {
                    if let url = URL(string: canonicalUrl) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "safari")
                            .font(.system(size: 20, weight: .semibold))
                        Text("Listen on Web")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                }
                .glassEffect(.regular, in: .rect(cornerRadius: 12))
            }
        }
    }

    // MARK: - Deep Link Helpers

    private func openSpotify(trackId: String) {
        // Try Spotify app deep link first
        if let spotifyURL = URL(string: "spotify:track:\(trackId)"),
           UIApplication.shared.canOpenURL(spotifyURL) {
            Haptics.light()
            UIApplication.shared.open(spotifyURL)
        } else {
            // Fall back to web player
            if let webURL = URL(string: "https://open.spotify.com/track/\(trackId)") {
                Haptics.light()
                UIApplication.shared.open(webURL)
            }
        }
    }

    private func openAppleMusic(trackId: String) {
        // Try Apple Music app deep link
        if let appleMusicURL = URL(string: "music://music.apple.com/song/\(trackId)"),
           UIApplication.shared.canOpenURL(appleMusicURL) {
            Haptics.light()
            UIApplication.shared.open(appleMusicURL)
        } else {
            // Fall back to web player
            if let webURL = URL(string: "https://music.apple.com/song/\(trackId)") {
                Haptics.light()
                UIApplication.shared.open(webURL)
            }
        }
    }
}
