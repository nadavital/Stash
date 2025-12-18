import SwiftUI

/// Detail view - miniature card at top, scrollable content below
struct CardDetailView: View {
    let emoji: String
    let title: String
    let source: String
    let backgroundColor: Color
    @Binding var displayMode: CardDisplayMode
    var onDismiss: () -> Void = {}

    @State private var dragOffset: CGFloat = 0
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            // Calculate expansion progress for pull-down animation
            let expansionProgress = min(max(dragOffset / 300.0, 0), 1)

            ZStack(alignment: .top) {
                // Background
                LinearGradient(colors: [Color.black, Color(white: 0.1)], startPoint: .top, endPoint: .bottom)
                    .ignoresSafeArea()

                // 1. SCROLL CONTENT
                ScrollView {
                    VStack(spacing: 0) {
                        // Spacer for header
                        Color.clear.frame(height: 120 + geometry.safeAreaInsets.top + 16)

                        VStack(alignment: .leading, spacing: 20) {
                            Text("Detail View")
                                .font(.system(size: 32, weight: .bold))
                                .foregroundStyle(.white)

                            Text("This content is now revealed underneath the morphing header.")
                                .font(.system(size: 17))
                                .foregroundStyle(.white.opacity(0.8))
                                .lineSpacing(6)

                            ForEach(0..<10) { index in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Section \(index + 1)")
                                        .font(.system(size: 20, weight: .semibold))
                                        .foregroundStyle(.white)
                                    Text("Lorem ipsum dolor sit amet, consectetur adipiscing elit.")
                                        .font(.system(size: 15))
                                        .foregroundStyle(.white.opacity(0.7))
                                }
                                .padding()
                                .background(.white.opacity(0.05))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .padding(24)
                    }
                    .background(
                        GeometryReader { scrollGeo in
                            Color.clear.preference(
                                key: ScrollOffsetPreferenceKey.self,
                                value: scrollGeo.frame(in: .named("scrollSpace")).minY
                            )
                        }
                    )
                }
                .coordinateSpace(name: "scrollSpace")
                .scrollDisabled(dragOffset > 0)
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
                    scrollOffset = value
                }

                // 2. HEADER (Mini Card)
                MorphingCard(
                    emoji: emoji,
                    title: title,
                    source: source,
                    background: backgroundColor
                )
                .frame(
                    height: 120 + (geometry.size.height - 120) * expansionProgress,
                    alignment: .top
                )
                .clipped()
                .padding(.top, geometry.safeAreaInsets.top)
                .ignoresSafeArea(edges: expansionProgress > 0 ? .top : [])
                
                // Back Button
                VStack {
                    Spacer()
                    Button {
                        dismissToDeck()
                    } label: {
                        Text("Back to Deck")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .padding(24)
                }
            }
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        let isAtTop = scrollOffset >= 0
                        let isPullingDown = value.translation.height > 0
                        if isAtTop && isPullingDown {
                            dragOffset = value.translation.height
                        }
                    }
                    .onEnded { value in
                        let shouldDismiss = dragOffset > 150 || value.velocity.height > 500

                        if shouldDismiss {
                            dismissToDeck()
                        } else {
                            // Cancel - spring back
                            withAnimation(StashTheme.Gesture.cancelSpring) {
                                dragOffset = 0
                            }
                            // Light haptic for cancel
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    }
            )
        }
    }

    private func dismissToDeck() {
        onDismiss()
        dragOffset = 0

        // Smooth dismissal with gesture-aware spring
        withAnimation(StashTheme.Gesture.completionSpring) {
            displayMode = .deck
        }

        // Haptic feedback
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
}

#Preview {
    CardDetailView(
        emoji: "📰",
        title: "How AI is Changing Everything",
        source: "The New York Times",
        backgroundColor: Color(red: 0.8, green: 0.2, blue: 0.2),
        displayMode: .constant(.detail)
    )
}
