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
    @State private var isHorizontalDragging: Bool = false

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
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 0) {
                            // Scroll anchor for resetting position
                            Color.clear
                                .frame(height: 1)
                                .id("top")

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
                    .onScrollGeometryChange(for: Bool.self) { geometry in
                    // Check if we're at the top of the scroll view
                    geometry.contentOffset.y <= 0
                    } action: { oldValue, newValue in
                        isScrolledToTop = newValue
                    }
                    .scrollDisabled(isDragging || isHorizontalDragging)
                    .onChange(of: scrollToTopTrigger) {
                        // Smooth scroll to top instead of nuking the ScrollView
                        withAnimation(StashTheme.Gesture.completionSpring) {
                            proxy.scrollTo("top", anchor: .top)
                        }
                    }
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

                            case .horizontal:
                                // Disable scrolling during horizontal swipes to prevent conflicts
                                if isScrolledToTop {
                                    isHorizontalDragging = true
                                    let isCurrentlyLeft = value.translation.width < 0
                                    let translation = abs(value.translation.width)
                                    let progress = min(translation / 200.0, 1.0)

                                    // Apply interactive fade and scale
                                    if (isCurrentlyLeft && canNavigateNext) || (!isCurrentlyLeft && canNavigatePrevious) {
                                        interactiveDragOpacity = 1.0 - (progress * 0.3)
                                        interactiveDragScale = 1.0 - (progress * 0.02)
                                        horizontalDragOffset = value.translation.width

                                        // Notify parent of drag progress (use current direction)
                                        onHorizontalDragChanged?(value.translation.width, isCurrentlyLeft)
                                    } else {
                                        // Rubber band effect at boundaries
                                        horizontalDragOffset = value.translation.width * 0.3
                                    }
                                }

                            default: break
                            }
                        }
                        .onEnded { value in
                            var shouldResetDragging = true

                            switch detectedDirection {
                            case .vertical:
                                if isDragging {
                                    let shouldDismiss = dragOffset > 150 || value.velocity.height > 500

                                    if shouldDismiss {
                                        // Don't reset isDragging - let parent handle it after animation completes
                                        shouldResetDragging = false
                                        onDismiss()
                                    } else {
                                        // Cancel - spring back
                                        withAnimation(StashTheme.Gesture.cancelSpring) {
                                            transitionProgress = 1.0
                                            isDragging = false
                                            dragOffset = 0
                                        }
                                        shouldResetDragging = false // Already reset in animation
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

                            // Reset states
                            detectedDirection = .none
                            dragOffset = 0
                            isHorizontalDragging = false
                            if shouldResetDragging {
                                isDragging = false
                            }
                        }
                    )
                    .opacity(combinedOpacity)
                    .scaleEffect(combinedScale)
                    .blur(radius: combinedBlur)
                    .animation(.none, value: interactiveDragOpacity)
                    .animation(.none, value: interactiveDragScale)
                    .animation(.none, value: horizontalDragOffset)
                }

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
        }
        .background(
            LinearGradient(
                colors: [Color.black, Color(white: 0.1)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
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
