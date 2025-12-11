import SwiftUI

/// Redesigned immersive card following core principles:
/// - Calm over busy: Clean, focused design with breathing room
/// - Deliver value inline: Summary visible, key insight front and center
/// - Image first with elegant gradient overlay
struct ImmersiveCard: View {
    let item: ItemSummary
    let relatedItems: [ItemSummary]
    let onAskStash: (ItemSummary) -> Void
    @Binding var showingDetail: Bool

    @State private var liked: Bool? = nil

    init(item: ItemSummary, relatedItems: [ItemSummary] = [], showingDetail: Binding<Bool>, onAskStash: @escaping (ItemSummary) -> Void = { _ in }) {
        self.item = item
        self.relatedItems = relatedItems
        self._showingDetail = showingDetail
        self.onAskStash = onAskStash
    }
    
    var body: some View {
        cardContent
    }

    private var cardContent: some View {
        ZStack(alignment: .bottom) {
            // Full-bleed media
            GeometryReader { geo in
                mediaBackground
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
            }

            // Elegant gradient for text readability - more of the image visible
            LinearGradient(
                colors: [
                    .clear,
                    .clear,
                    .clear,
                    .black.opacity(0.3),
                    .black.opacity(0.7),
                    .black.opacity(0.85)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            
            // Content overlay
            VStack(alignment: .leading, spacing: 0) {
                // Top bar - type indicator and share
                HStack {
                    // Type pill
                    HStack(spacing: 6) {
                        Text(item.primaryEmoji)
                            .font(.system(size: 13))
                        Text(item.type.displayName)
                            .font(.system(size: 12, weight: .medium))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .glassEffect()
                    
                    Spacer()
                    
                    // Share button
                    Button {
                        Haptics.light()
                        // TODO: Share
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 14, weight: .medium))
                            .frame(width: 32, height: 32)
                            .glassEffect(in: .circle)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                
                Spacer()
                
                // Bottom content
                VStack(alignment: .leading, spacing: 12) {
                    // Title
                    Text(item.title)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    
                    // Summary - the value
                    Text(item.summary)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                    
                    // Action row
                    HStack(spacing: 12) {
                        // Thumbs up/down grouped together
                        HStack(spacing: 0) {
                            Button {
                                Haptics.light()
                                withAnimation(.spring(response: 0.25)) {
                                    liked = liked == true ? nil : true
                                }
                            } label: {
                                Image(systemName: liked == true ? "hand.thumbsup.fill" : "hand.thumbsup")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(liked == true ? StashTheme.Color.accent : .primary)
                                    .frame(width: 40, height: 36)
                            }
                            .buttonStyle(.plain)
                            
                            Divider()
                                .frame(height: 20)
                            
                            Button {
                                Haptics.light()
                                withAnimation(.spring(response: 0.25)) {
                                    liked = liked == false ? nil : false
                                }
                            } label: {
                                Image(systemName: liked == false ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(liked == false ? StashTheme.Color.accent : .primary)
                                    .frame(width: 40, height: 36)
                            }
                            .buttonStyle(.plain)
                        }
                        .glassEffect(in: .capsule)
                        
                        Spacer()
                        
                        // Ask Stash button with glyph
                        Button {
                            Haptics.light()
                            onAskStash(item)
                        } label: {
                            Image("stash-glyph")
                                .resizable()
                                .renderingMode(.template)
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 20, height: 20)
                                .foregroundStyle(.primary)
                                .frame(width: 36, height: 36)
                                .glassEffect(in: .circle)
                        }
                        .buttonStyle(.plain)
                        
                        // Primary CTA
                        Button {
                            Haptics.medium()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: primaryActionIcon)
                                    .font(.system(size: 13, weight: .semibold))
                                Text(primaryActionLabel)
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.glassProminent)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
        .frame(height: 480) // Taller cards for more breathing room
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .onTapGesture {
            Haptics.light()
            showingDetail = true
        }
    }
    
    // MARK: - Media Background
    
    @ViewBuilder
    private var mediaBackground: some View {
        if let iconUrl = item.metadata.iconUrl, let url = URL(string: iconUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                case .failure:
                    fallbackGradient
                case .empty:
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
                        endRadius: 400
                    )
                )
                .frame(width: 600, height: 600)
                .offset(x: -200, y: -200)
            
            // Emoji watermark
            Text(item.primaryEmoji)
                .font(.system(size: 160))
                .opacity(0.06)
                .offset(x: 60, y: -80)
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
    
    // MARK: - Action Properties
    
    private var primaryActionIcon: String {
        switch item.type {
        case .song: return "play.fill"
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel: return "play.fill"
        case .article: return "book.fill"
        case .recipe: return "fork.knife"
        case .event: return "calendar"
        default: return "arrow.right"
        }
    }
    
    private var primaryActionLabel: String {
        switch item.type {
        case .song: return "Play"
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel: return "Watch"
        case .article: return "Read"
        case .recipe: return "Cook"
        case .event: return "View"
        default: return "Open"
        }
    }
}

// MARK: - Preview

#Preview("Card") {
    @Previewable @State var showingDetail = false
    ScrollView {
        ImmersiveCard(item: .mockArticle, showingDetail: $showingDetail)
            .padding(.horizontal, 16)
    }
    .background(Color.black)
}

#Preview("Feed") {
    @Previewable @State var showingDetail = false
    ScrollView {
        VStack(spacing: 20) {
            ImmersiveCard(item: .mockArticle, showingDetail: $showingDetail)
            ImmersiveCard(item: .mockSong, showingDetail: $showingDetail)
        }
        .padding(.horizontal, 16)
    }
    .background(Color.black)
}

#Preview("Song Card") {
    @Previewable @State var showingDetail = false
    ScrollView {
        ImmersiveCard(item: .mockSong, showingDetail: $showingDetail)
            .padding(.horizontal, 16)
    }
    .background(Color.black)
}
