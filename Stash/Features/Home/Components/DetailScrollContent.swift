import SwiftUI

/// Scrollable content for detail view with pull-to-dismiss and horizontal navigation
struct DetailScrollContent: View {
    let emoji: String
    let title: String
    let source: String
    @Binding var transitionProgress: CGFloat
    @Binding var isDragging: Bool
    let scrollToTopTrigger: UUID
    var onDismiss: () -> Void
    var onHorizontalDragChanged: ((CGFloat, Bool) -> Void)?  // offset, isLeft
    var onHorizontalDragEnded: ((CGFloat, Bool) -> Void)?    // offset, isLeft
    var canNavigateNext: Bool = true
    var canNavigatePrevious: Bool = true

    @State private var isScrolledToTop: Bool = true
    @State private var dragOffset: CGFloat = 0
    @State private var horizontalDragOffset: CGFloat = 0
    @State private var detectedDirection: GestureDirection = .none
    @State private var interactiveDragOpacity: CGFloat = 1.0
    @State private var interactiveDragScale: CGFloat = 1.0
    @State private var scrollViewID: UUID = UUID()

    // Interactive drag feedback
    private var combinedOpacity: CGFloat {
        return interactiveDragOpacity
    }

    private var combinedScale: CGFloat {
        return interactiveDragScale
    }

    private var combinedBlur: CGFloat {
        return (1.0 - interactiveDragOpacity) * 8
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ScrollView {
                    VStack(spacing: 0) {
                        // Spacer for header (safe area + content height + gap)
                        Color.clear.frame(height: geometry.safeAreaInsets.top + 60 + 48)

                        VStack(alignment: .leading, spacing: 20) {
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
                }
                .id(scrollViewID)
                .onScrollGeometryChange(for: Bool.self) { geometry in
                    // Check if we're at the top of the scroll view
                    geometry.contentOffset.y <= 0
                } action: { oldValue, newValue in
                    isScrolledToTop = newValue
                }
                .scrollDisabled(isDragging)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            // Detect direction on first move
                            if detectedDirection == .none && (abs(value.translation.width) > 10 || abs(value.translation.height) > 10) {
                                detectedDirection = GestureDirection.detect(translation: value.translation, threshold: 10)
                            }

                            switch detectedDirection {
                            case .vertical(let up):
                                // Only allow pull-to-dismiss when scrolled to the very top and pulling down
                                let isPullingDown = !up

                                // Only set isDragging (which disables scroll) if we're COMMITTED to pull-to-dismiss
                                if isScrolledToTop && isPullingDown && value.translation.height > 20 {
                                    isDragging = true
                                    dragOffset = value.translation.height

                                    let screenHeight = geometry.size.height
                                    let totalDistance = screenHeight - 120
                                    transitionProgress = max(1.0 - (dragOffset / totalDistance), 0)
                                }

                            case .horizontal(let left):
                                // Horizontal swipes don't need to disable scrolling
                                if isScrolledToTop {
                                    let translation = abs(value.translation.width)
                                    let progress = min(translation / 200.0, 1.0)

                                    // Apply interactive fade and scale
                                    if (left && canNavigateNext) || (!left && canNavigatePrevious) {
                                        interactiveDragOpacity = 1.0 - (progress * 0.3)
                                        interactiveDragScale = 1.0 - (progress * 0.02)
                                        horizontalDragOffset = value.translation.width

                                        // Notify parent of drag progress
                                        onHorizontalDragChanged?(value.translation.width, left)
                                    } else {
                                        // Rubber band effect at boundaries
                                        horizontalDragOffset = value.translation.width * 0.3
                                    }
                                }

                            default: break
                            }
                        }
                        .onEnded { value in
                            switch detectedDirection {
                            case .vertical:
                                if isDragging {
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

                            case .horizontal(let left):
                                // Notify parent of drag end
                                onHorizontalDragEnded?(value.translation.width, left)

                                // Reset interactive states
                                withAnimation(StashTheme.Gesture.cancelSpring) {
                                    interactiveDragOpacity = 1.0
                                    interactiveDragScale = 1.0
                                    horizontalDragOffset = 0
                                }

                            default: break
                            }

                            detectedDirection = .none
                            dragOffset = 0
                            isDragging = false
                        }
                )
                .opacity(combinedOpacity)
                .scaleEffect(combinedScale)
                .blur(radius: combinedBlur)

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
            .onChange(of: scrollToTopTrigger) {
                scrollViewID = UUID()
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
