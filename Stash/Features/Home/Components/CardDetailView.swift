import SwiftUI

/// Detail view - card shrinks to top, content appears below
/// Swipe down or tap miniature card to dismiss back to deck
struct CardDetailView: View {
    let emoji: String
    let title: String
    let source: String
    let backgroundColor: Color
    let namespace: Namespace.ID
    @Binding var displayMode: CardDisplayMode
    @Binding var cardVerticalOffset: CGFloat

    @State private var localDragOffset: CGFloat = 0
    @State private var isInteractiveDragging = false
    @State private var showContent = false
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        GeometryReader { safeAreaGeometry in
            ZStack(alignment: .top) {
                // Background: Detail content area (mock placeholder)
                VStack(spacing: 0) {
                // Spacing for card at top (miniature is ~100pt tall)
                Spacer()
                    .frame(height: 120)

                ScrollView {
                VStack(spacing: 0) {
                    GeometryReader { geometry in
                        Color.clear.preference(
                            key: ScrollOffsetPreferenceKey.self,
                            value: geometry.frame(in: .named("scroll")).minY
                        )
                    }
                    .frame(height: 0)

                    VStack(alignment: .leading, spacing: 20) {
                    Text("Detail View")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundStyle(.white)
                        .opacity(showContent ? 1 : 0)

                    Text("This is where the full content would appear. For now, it's just a placeholder to test the animation.")
                        .font(.system(size: 17))
                        .foregroundStyle(.white.opacity(0.8))
                        .lineSpacing(6)
                        .opacity(showContent ? 1 : 0)

                    // Mock content blocks
                    ForEach(0..<5) { index in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Section \(index + 1)")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(.white)

                            Text("Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.")
                                .font(.system(size: 15))
                                .foregroundStyle(.white.opacity(0.7))
                                .lineSpacing(4)
                        }
                        .padding()
                        .background(.white.opacity(0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .opacity(showContent ? 1 : 0)
                    }
                    }
                    .padding(24)
                    .opacity(showContent ? 1 : 0)
                }
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
                scrollOffset = value
            }
            .simultaneousGesture(pullDownGesture)

            Spacer()

            // Back button
            Button {
                showContent = false  // Hide detail content immediately

                // Start morphing animation
                withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                    cardVerticalOffset = 0  // Reset to bottom
                }

                // Delay displayMode change until after animation completes
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    displayMode = .deck
                }
            } label: {
                Text("Back to Deck")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(.ultraThinMaterial)
                    .glassEffect()
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
            .opacity(showContent ? 1 : 0)
            }
            .zIndex(0)

                // Foreground: Miniature card (always on top)
                miniatureCardContainer
                    .zIndex(1)
                    .padding(.top, safeAreaGeometry.safeAreaInsets.top)  // Push below safe area
            }
            .background(
                LinearGradient(
                    colors: [Color.black, Color(white: 0.1)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
            )
            // NO .offset() here - entire view NEVER moves
            .onAppear {
                // Delay content fade-in so card morphing is visible
                withAnimation(.easeIn(duration: 0.2).delay(0.4)) {
                    showContent = true
                }
            }
        }
    }

    // MARK: - Computed Properties

    private var miniatureCardContainer: some View {
        GeometryReader { geometry in
            VStack(alignment: .leading, spacing: interpolatedSpacing) {
                Text(emoji)
                    .font(.system(size: interpolatedEmojiSize))

                Text(title)
                    .font(.system(size: interpolatedTitleSize, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(expansionProgress > 0.5 ? 2 : 1)
                    .shadow(color: expansionProgress > 0.3 ? .black.opacity(0.3) : .clear, radius: 8, y: 4)

                Text(source)
                    .font(.system(size: interpolatedSourceSize, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, interpolatedHorizontalPadding)
            .padding(.top, interpolatedTopInnerPadding)
            .padding(.bottom, interpolatedBottomPadding)
            .frame(
                width: interpolatedWidth(screenWidth: geometry.size.width),
                height: interpolatedHeight(screenHeight: geometry.size.height),
                alignment: interpolatedAlignment
            )
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: interpolatedCornerRadius))
            .if(!isInteractiveDragging || expansionProgress >= 0.95) { view in
                view.matchedGeometryEffect(id: "card-morph", in: namespace)
            }
            .frame(maxWidth: .infinity)  // Center horizontally
            .padding(.horizontal, expansionProgress > 0 ? 0 : 16)
            .onTapGesture {
                if !isInteractiveDragging {
                    showContent = false  // Hide detail content immediately

                    // Start morphing animation
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        cardVerticalOffset = 0
                    }

                    // Delay displayMode change until after animation completes
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        displayMode = .deck
                    }
                }
            }
        }
    }

    // Progress from miniature (0.0) to full-screen (1.0)
    private var expansionProgress: CGFloat {
        min(localDragOffset / 200.0, 1.0)
    }

    // Interpolated properties (miniature → full-screen)
    private var interpolatedEmojiSize: CGFloat {
        20 + (12 * expansionProgress)  // 20 → 32
    }

    private var interpolatedTitleSize: CGFloat {
        14 + (18 * expansionProgress)  // 14 → 32
    }

    private var interpolatedSourceSize: CGFloat {
        11 + (3 * expansionProgress)  // 11 → 14
    }

    private var interpolatedSpacing: CGFloat {
        6 + (6 * expansionProgress)  // 6 → 12
    }

    private var interpolatedHorizontalPadding: CGFloat {
        16 + (8 * expansionProgress)  // 16 → 24
    }

    private var interpolatedTopInnerPadding: CGFloat {
        12 + (12 * expansionProgress)  // 12 → 24 (matches CardContent)
    }

    private var interpolatedBottomPadding: CGFloat {
        12 + (128 * expansionProgress)  // 12 → 140
    }

    private var interpolatedCornerRadius: CGFloat {
        16 + (8 * expansionProgress)  // 16 → 24
    }

    // Alignment shifts from topLeading (miniature) to bottomLeading (full-screen)
    private var interpolatedAlignment: Alignment {
        expansionProgress > 0.5 ? .bottomLeading : .topLeading
    }

    private func interpolatedWidth(screenWidth: CGFloat) -> CGFloat {
        let miniWidth = screenWidth - 32  // Account for 16pt padding on each side
        let fullWidth = screenWidth
        return miniWidth + ((fullWidth - miniWidth) * expansionProgress)
    }

    private func interpolatedHeight(screenHeight: CGFloat) -> CGFloat? {
        // Smoothly grow from miniature (~100pt) to full screen
        let miniatureHeight: CGFloat = 100
        let fullHeight = screenHeight  // Fill entire screen height
        return miniatureHeight + ((fullHeight - miniatureHeight) * expansionProgress)
    }

    private var pullDownGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard scrollOffset >= -5 && value.translation.height > 0 else { return }

                if !isInteractiveDragging {
                    isInteractiveDragging = true
                    Haptics.light()
                }

                // ONLY update local state (no cardVerticalOffset!)
                localDragOffset = value.translation.height
            }
            .onEnded { value in
                guard isInteractiveDragging else { return }

                if value.translation.height > 100 {
                    // Complete dismiss - hide content immediately
                    showContent = false

                    // Re-enable matchedGeometryEffect for smooth morph
                    isInteractiveDragging = false

                    // Animate to full expansion FIRST
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.85)) {
                        localDragOffset = 400  // Force full expansion
                        cardVerticalOffset = 0  // Move card back to deck position
                    }

                    // Once fully expanded, switch to deck mode (OUTSIDE animation to prevent flash)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        displayMode = .deck
                        // Reset state after mode switch
                        localDragOffset = 0
                    }
                } else {
                    // Snap back - re-enable matchedGeometryEffect
                    isInteractiveDragging = false
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        localDragOffset = 0
                    }
                }
            }
    }
}

// Preference key for tracking scroll position
struct ScrollOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

#Preview {
    @Previewable @Namespace var namespace
    @Previewable @State var offset: CGFloat = 0
    CardDetailView(
        emoji: "📰",
        title: "How AI is Changing Everything",
        source: "The New York Times",
        backgroundColor: Color(red: 0.8, green: 0.2, blue: 0.2),
        namespace: namespace,
        displayMode: .constant(.detail),
        cardVerticalOffset: $offset
    )
}
