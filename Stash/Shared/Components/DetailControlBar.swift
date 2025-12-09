import SwiftUI

/// Universal bottom control bar for all detail views
/// Provides consistent placement: [Share] [Primary Action] [Ask Stash]
/// Following Liquid Glass design guidelines
struct DetailControlBar: View {
    let item: ItemSummary
    let primaryActionLabel: String
    let primaryActionIcon: String
    let onPrimaryAction: () -> Void
    let onShare: () -> Void
    
    @State private var showAskStash = false
    
    var body: some View {
        HStack(spacing: Spacing.md) {
            // Share button - left side (circular)
            Button {
                Haptics.light()
                onShare()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 16, weight: .medium))
                    .frame(width: 44, height: 44)
            }
            .glassEffect(in: .circle)
            
            Spacer()
            
            // Primary action - center
            Button {
                Haptics.medium()
                onPrimaryAction()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: primaryActionIcon)
                        .font(.system(size: 14, weight: .semibold))
                    Text(primaryActionLabel)
                        .font(.system(size: 14, weight: .semibold))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .buttonStyle(.glassProminent)
            
            Spacer()
            
            // Ask Stash button - right side
            Button {
                Haptics.medium()
                showAskStash = true
            } label: {
                SynapseLensView(size: 44, state: .idle, palette: .cosmic)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .sheet(isPresented: $showAskStash) {
            AskStashSheet(item: item)
        }
    }
}

// MARK: - Detail Toolbar Modifier

/// Consistent toolbar for all detail views with Like/Dislike in top-right
struct DetailToolbarModifier: ViewModifier {
    let item: ItemSummary
    @Binding var liked: Bool?
    let onLikeChanged: (Bool?) -> Void
    
    func body(content: Content) -> some View {
        content
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 0) {
                        // Like button
                        Button {
                            Haptics.light()
                            withAnimation(.spring(response: 0.25)) {
                                let newValue: Bool? = liked == true ? nil : true
                                liked = newValue
                                onLikeChanged(newValue)
                            }
                        } label: {
                            Image(systemName: liked == true ? "hand.thumbsup.fill" : "hand.thumbsup")
                                .font(.system(size: 16, weight: .medium))
                                .frame(width: 40, height: 36)
                        }
                        .buttonStyle(.plain)
                        
                        Divider()
                            .frame(height: 20)
                        
                        // Dislike button
                        Button {
                            Haptics.light()
                            withAnimation(.spring(response: 0.25)) {
                                let newValue: Bool? = liked == false ? nil : false
                                liked = newValue
                                onLikeChanged(newValue)
                            }
                        } label: {
                            Image(systemName: liked == false ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                                .font(.system(size: 16, weight: .medium))
                                .frame(width: 40, height: 36)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
    }
}

extension View {
    /// Apply consistent detail view toolbar with Like/Dislike controls
    func detailToolbar(
        item: ItemSummary,
        liked: Binding<Bool?>,
        onLikeChanged: @escaping (Bool?) -> Void
    ) -> some View {
        modifier(DetailToolbarModifier(item: item, liked: liked, onLikeChanged: onLikeChanged))
    }
}

// MARK: - Engagement Tracking Modifier

/// Tracks when a detail view is opened and closed for engagement metrics
struct EngagementTrackingModifier: ViewModifier {
    let itemId: String
    private let actionsManager = ItemActionsManager.shared
    
    func body(content: Content) -> some View {
        content
            .onAppear {
                actionsManager.trackOpen(itemId: itemId)
            }
    }
}

extension View {
    /// Track engagement when this detail view appears
    func trackEngagement(itemId: String) -> some View {
        modifier(EngagementTrackingModifier(itemId: itemId))
    }
}

// MARK: - Preview

#Preview("Control Bar") {
    ZStack {
        LinearGradient(
            colors: [.purple, .blue],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
        
        VStack {
            Spacer()
            DetailControlBar(
                item: .mockArticle,
                primaryActionLabel: "Read",
                primaryActionIcon: "book.fill",
                onPrimaryAction: { },
                onShare: { }
            )
        }
    }
}
