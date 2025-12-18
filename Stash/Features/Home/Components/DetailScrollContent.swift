import SwiftUI

/// Scrollable content for detail view with pull-to-dismiss gesture
struct DetailScrollContent: View {
    let emoji: String
    let title: String
    let source: String
    @Binding var transitionProgress: CGFloat
    @Binding var isDragging: Bool
    var onDismiss: () -> Void

    @State private var scrollOffset: CGFloat = 0
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
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
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
                scrollOffset = value
            }
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        let isAtTop = scrollOffset >= 0
                        let isPullingDown = value.translation.height > 0

                        if isAtTop && isPullingDown {
                            isDragging = true
                            dragOffset = value.translation.height

                            // Calculate interactive transition progress
                            let screenHeight = geometry.size.height
                            let totalDistance = screenHeight - 120
                            transitionProgress = max(1.0 - (dragOffset / totalDistance), 0)
                        }
                    }
                    .onEnded { value in
                        let shouldDismiss = dragOffset > 150 || value.velocity.height > 500

                        if shouldDismiss {
                            onDismiss()
                        } else {
                            // Cancel - spring back
                            withAnimation(StashTheme.Gesture.cancelSpring) {
                                transitionProgress = 1.0
                                isDragging = false
                                dragOffset = 0
                            }
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    }
            )

            // Dismiss button overlay
            VStack {
                Spacer()
                Button {
                    onDismiss()
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
        .background(
            LinearGradient(
                colors: [Color.black, Color(white: 0.1)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }
}

// MARK: - Preference Key

struct ScrollOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
