import SwiftUI

/// Card display modes for transitions
enum CardDisplayMode {
    case deck      // Normal card in deck
    case detail    // Expanded to detail view
    case chat      // Morphed into AI chat
}

struct HomeView: View {
    @State private var currentIndex = 0
    @State private var displayMode: CardDisplayMode = .deck
    @State private var showControls = true

    // Gesture state
    @State private var dragTranslation: CGSize = .zero
    @State private var detectedDirection: GestureDirection = .none
    @State private var dragStartLocation: CGPoint = .zero

    // Vertical transition state (0 = deck, 1 = detail)
    @State private var transitionProgress: CGFloat = 0
    @State private var isDragging = false

    // Horizontal swipe animation state
    @State private var currentCardOffset: CGFloat = 0
    @State private var currentCardRotation: Double = 0
    @State private var currentCardScale: CGFloat = 1.0
    @State private var showNextCard = true

    // Previous card animation state
    @State private var previousCardOffset: CGFloat = -1000
    @State private var previousCardRotation: Double = -25
    @State private var previousCardScale: CGFloat = 0.7
    @State private var showPreviousCard = false

    // Detail mode state
    @State private var scrollToTopTrigger: UUID = UUID()

    // Interactive horizontal drag in detail mode
    @State private var detailHorizontalDragOffset: CGFloat = 0
    @State private var showNextDetailCard = false
    @State private var showPreviousDetailCard = false

    // Test colors
    private let testColors: [Color] = [
        Color(red: 0.8, green: 0.2, blue: 0.2), // Red
        Color(red: 0.2, green: 0.4, blue: 0.8), // Blue
        Color(red: 0.2, green: 0.7, blue: 0.3), // Green
        Color(red: 0.9, green: 0.5, blue: 0.1), // Orange
        Color(red: 0.6, green: 0.2, blue: 0.8)  // Purple
    ]

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                ZStack(alignment: .top) {
                    // MAIN CARD STACK - contains all cards and transitions
                    mainCardStack(screenHeight: geometry.size.height, screenWidth: geometry.size.width)

                    // CONTROLS
                    if displayMode == .deck {
                        floatingControls
                            .opacity(showControls ? (1.0 - transitionProgress) : 0)
                            .zIndex(200)
                    }
                }
                .gesture(
                    DragGesture(minimumDistance: 10)
                        .onChanged { value in
                            handleDragChanged(value: value, screenWidth: geometry.size.width, screenHeight: geometry.size.height)
                        }
                        .onEnded { value in
                            handleDragEnded(value: value, screenWidth: geometry.size.width, screenHeight: geometry.size.height)
                        }
                )
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Main Card Stack

    @ViewBuilder
    private func mainCardStack(screenHeight: CGFloat, screenWidth: CGFloat) -> some View {
        let isVerticalGesture = detectedDirection.isVertical || isDragging

        ZStack(alignment: .top) {
            // DECK MODE: Background cards
            if displayMode == .deck {
                // Next card (Static Background)
                if showNextCard && !isDragging {
                    nextCard()
                        .zIndex(1)
                }

                // Previous Card (when swiping right) - appears ABOVE main card
                if showPreviousCard && currentIndex > 0 {
                    previousCard(screenWidth: screenWidth)
                        .zIndex(150)  // Above main card (100) but below controls (200)
                }
            }

            // DETAIL MODE: Content and cards
            if displayMode == .detail {
                // Detail content (scrollable body)
                detailContent()
                    .zIndex(0)

                // Next card (slides in from right)
                if showNextDetailCard {
                    detailCard(for: currentIndex + 1, screenHeight: screenHeight)
                        .offset(x: UIScreen.main.bounds.width + detailHorizontalDragOffset)
                        .zIndex(1)
                }

                // Previous card (slides in from left)
                if showPreviousDetailCard && currentIndex > 0 {
                    detailCard(for: currentIndex - 1, screenHeight: screenHeight)
                        .offset(x: -UIScreen.main.bounds.width + detailHorizontalDragOffset)
                        .zIndex(1)
                }
            }

            // MAIN CARD - common for both modes
            if displayMode == .deck {
                // Deck mode card
                MorphingCard(
                    emoji: mockEmoji(for: currentIndex),
                    title: mockTitle(for: currentIndex),
                    source: mockSource(for: currentIndex),
                    background: testBackground(for: currentIndex)
                )
                .frame(height: cardHeight(screenHeight: screenHeight), alignment: .top)
                .clipped()
                .ignoresSafeArea(.container, edges: .top)
                .scaleEffect(currentCardScale)
                .offset(x: currentCardOffset)
                .rotationEffect(.degrees(currentCardRotation))
                .allowsHitTesting(true)
                .onTapGesture { expandToDetail() }
                .zIndex(100)

            } else {
                // Detail mode card (slides during horizontal drag)
                detailCard(for: currentIndex, screenHeight: screenHeight)
                    .offset(x: isVerticalGesture ? 0 : detailHorizontalDragOffset)
                    .zIndex(100)
            }
        }
    }

    // Helper to create a detail mode card
    @ViewBuilder
    private func detailCard(for index: Int, screenHeight: CGFloat) -> some View {
        MorphingCard(
            emoji: mockEmoji(for: index),
            title: mockTitle(for: index),
            source: mockSource(for: index),
            background: testBackground(for: index)
        )
        .frame(height: cardHeight(screenHeight: screenHeight), alignment: .top)
        .clipped()
        .ignoresSafeArea(.container, edges: .top)
    }

    // Calculate card height based on mode and gesture
    private func cardHeight(screenHeight: CGFloat) -> CGFloat {
        let deckHeight = screenHeight
        // Detail height = safe area + fixed content height (text sits at bottom in safe area)
        let safeAreaTop = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first?.safeAreaInsets.top ?? 59
        let detailHeight: CGFloat = safeAreaTop + 60

        // During drag, use interactive progress
        if isDragging {
            return deckHeight - (deckHeight - detailHeight) * transitionProgress
        }

        // When not dragging, use animated progress
        return displayMode == .deck ? deckHeight : detailHeight
    }

    // MARK: - Detail Content

    @ViewBuilder
    private func detailContent() -> some View {
        DetailScrollContent(
            emoji: mockEmoji(for: currentIndex),
            title: mockTitle(for: currentIndex),
            source: mockSource(for: currentIndex),
            transitionProgress: $transitionProgress,
            isDragging: $isDragging,
            scrollToTopTrigger: scrollToTopTrigger,
            onDismiss: {
                collapseToCard()
            },
            onHorizontalDragChanged: { offset, isLeft in
                handleDetailHorizontalDragChanged(offset: offset, isLeft: isLeft)
            },
            onHorizontalDragEnded: { offset, isLeft in
                handleDetailHorizontalDragEnded(offset: offset, isLeft: isLeft)
            },
            canNavigateNext: true, // In real app: check if not at end
            canNavigatePrevious: currentIndex > 0
        )
    }

    // MARK: - Card Views

    private func nextCard() -> some View {
        MorphingCard(
            emoji: mockEmoji(for: currentIndex + 1),
            title: mockTitle(for: currentIndex + 1),
            source: mockSource(for: currentIndex + 1),
            background: testBackground(for: currentIndex + 1)
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func previousCard(screenWidth: CGFloat) -> some View {
        MorphingCard(
            emoji: mockEmoji(for: currentIndex - 1),
            title: mockTitle(for: currentIndex - 1),
            source: mockSource(for: currentIndex - 1),
            background: testBackground(for: currentIndex - 1)
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .scaleEffect(previousCardScale)
        .rotationEffect(.degrees(previousCardRotation))
        .offset(x: previousCardOffset)
    }

    @ViewBuilder
    private func testBackground(for index: Int) -> some View {
        if index % 2 == 0 {
            ZStack {
                Color.black
                LinearGradient(
                    colors: [testColors[index % testColors.count], .black],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        } else {
            testColors[index % testColors.count]
        }
    }

    // MARK: - Controls

    private var floatingControls: some View {
        VStack {
            // Top: Profile button
            HStack {
                Spacer()
                Button {} label: {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                }
                .padding(.trailing, 20)
            }
            .padding(.top, 60)

            Spacer()

            // Bottom: Add button (left) and AI orb (right)
            HStack(alignment: .bottom) {
                // Add button
                Button {} label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.white)
                        .background(Circle().fill(.black.opacity(0.3)).frame(width: 56, height: 56))
                }

                Spacer()

                // Synapse Lens (AI orb)
                Button {} label: {
                    SynapseLensView(size: 56, state: .idle)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Gestures

    private func handleDragChanged(value: DragGesture.Value, screenWidth: CGFloat, screenHeight: CGFloat) {
        // Only handle gestures in deck mode (detail has its own gesture handler)
        guard displayMode == .deck else { return }

        // Detect direction on first move
        if detectedDirection == .none {
            detectedDirection = GestureDirection.detect(translation: value.translation, threshold: 15)
            dragStartLocation = value.startLocation
        }
        dragTranslation = value.translation

        switch detectedDirection {
        case .vertical(let up):
            // Only allow upward swipe from bottom half in deck mode
            if up && dragStartLocation.y > screenHeight * 0.65 {
                isDragging = true
                let distance = -value.translation.height
                let totalDistance = screenHeight - 120
                transitionProgress = min(max(distance / totalDistance, 0), 1)
            }

        case .horizontal(let left):
            let translation = value.translation.width
            if left {
                // Swipe left - next card (current card moves left)
                currentCardOffset = translation
                currentCardRotation = Double(translation / screenWidth) * 15
                currentCardScale = 1.0 - (abs(translation) / screenWidth * 0.1)
            } else {
                // Swipe right - previous card slides on top from left
                if currentIndex > 0 {
                    showPreviousCard = true

                    // Current card stays in place (no offset)
                    // Previous card slides in from left, ON TOP
                    let progress = translation / screenWidth
                    previousCardOffset = -screenWidth * (1.0 - progress)
                    previousCardRotation = -25 + (25 * progress)
                    previousCardScale = 0.7 + (0.3 * progress)
                }
            }

        default: break
        }
    }

    private func handleDragEnded(value: DragGesture.Value, screenWidth: CGFloat, screenHeight: CGFloat) {
        // Only handle gestures in deck mode (detail has its own gesture handler)
        guard displayMode == .deck else {
            detectedDirection = .none
            dragTranslation = .zero
            return
        }

        let verticalVelocity = value.predictedEndLocation.y - value.location.y

        switch detectedDirection {
        case .vertical(let up):
            if isDragging && up {
                // Calculate threshold for upward swipe
                let shouldCommit = transitionProgress > 0.25 || verticalVelocity < -500

                if shouldCommit {
                    expandToDetail()
                } else {
                    // Cancel - spring back
                    withAnimation(StashTheme.Gesture.cancelSpring) {
                        transitionProgress = 0
                        isDragging = false
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }

        case .horizontal(let left):
            let threshold = screenWidth * 0.25
            if left && value.translation.width < -threshold {
                navigateToNextCard(screenWidth: screenWidth)
            } else if !left && value.translation.width > threshold && currentIndex > 0 {
                navigateToPreviousCard(screenWidth: screenWidth)
            } else {
                cancelHorizontalSwipe(isLeft: left, screenWidth: screenWidth)
            }

        default: break
        }

        detectedDirection = .none
        dragTranslation = .zero
    }

    // MARK: - Transition Actions

    private func expandToDetail() {
        let isHighVelocity = transitionProgress > 0.5

        withAnimation(isHighVelocity
            ? Animation.spring(response: 0.28, dampingFraction: 0.84)
            : StashTheme.Gesture.completionSpring) {
            displayMode = .detail
            transitionProgress = 1.0
            isDragging = false
            showControls = false
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func collapseToCard() {
        withAnimation(StashTheme.Gesture.completionSpring) {
            displayMode = .deck
            transitionProgress = 0
            isDragging = false
            showControls = true
        }

        // Re-enable next card after animation
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            showNextCard = true
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    // MARK: - Navigation Helpers

    private func navigateToNextCard(screenWidth: CGFloat) {
        withAnimation(StashTheme.Gesture.completionSpring) {
            currentCardOffset = -screenWidth * 1.5
            currentCardRotation = -25
            currentCardScale = 0.7
        }

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            currentIndex += 1
            currentCardOffset = 0
            currentCardRotation = 0
            currentCardScale = 1.0
        }
    }

    private func navigateToPreviousCard(screenWidth: CGFloat) {
        withAnimation(StashTheme.Gesture.completionSpring) {
            previousCardOffset = 0
            previousCardRotation = 0
            previousCardScale = 1.0
        }

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            currentIndex -= 1
            showPreviousCard = false
            previousCardOffset = -screenWidth * 1.5
            previousCardRotation = -25
            previousCardScale = 0.7
        }
    }

    private func cancelHorizontalSwipe(isLeft: Bool, screenWidth: CGFloat) {
        withAnimation(StashTheme.Gesture.cancelSpring) {
            currentCardOffset = 0
            currentCardRotation = 0
            currentCardScale = 1.0
            if !isLeft {
                previousCardOffset = -screenWidth * 1.5
                previousCardRotation = -25
                previousCardScale = 0.7
            }
        }

        if !isLeft {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(300))
                showPreviousCard = false
            }
        }
    }

    // MARK: - Detail Horizontal Drag Handlers

    private func handleDetailHorizontalDragChanged(offset: CGFloat, isLeft: Bool) {
        detailHorizontalDragOffset = offset

        // Show appropriate card
        if isLeft {
            showNextDetailCard = true
            showPreviousDetailCard = false
        } else {
            showPreviousDetailCard = currentIndex > 0
            showNextDetailCard = false
        }
    }

    private func handleDetailHorizontalDragEnded(offset: CGFloat, isLeft: Bool) {
        let threshold: CGFloat = 100
        let screenWidth = UIScreen.main.bounds.width

        if isLeft && abs(offset) > threshold {
            // Commit: slide to next
            withAnimation(StashTheme.Gesture.completionSpring) {
                detailHorizontalDragOffset = -screenWidth
            }

            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(350))
                currentIndex += 1
                scrollToTopTrigger = UUID()
                detailHorizontalDragOffset = 0
                showNextDetailCard = false
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }

        } else if !isLeft && abs(offset) > threshold && currentIndex > 0 {
            // Commit: slide to previous
            withAnimation(StashTheme.Gesture.completionSpring) {
                detailHorizontalDragOffset = screenWidth
            }

            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(350))
                currentIndex -= 1
                scrollToTopTrigger = UUID()
                detailHorizontalDragOffset = 0
                showPreviousDetailCard = false
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }

        } else {
            // Cancel: spring back
            withAnimation(StashTheme.Gesture.cancelSpring) {
                detailHorizontalDragOffset = 0
            }

            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(300))
                showNextDetailCard = false
                showPreviousDetailCard = false
            }

            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    // MARK: - Mocks

    private func mockEmoji(for index: Int) -> String {
        ["📰", "🎵", "🍝", "🎬", "✈️"][index % 5]
    }

    private func mockTitle(for index: Int) -> String {
        ["How AI is Changing Everything", "Best Songs of the Year", "Perfect Pasta Carbonara", "Must-Watch Documentary", "Travel Guide to Iceland"][index % 5]
    }

    private func mockSource(for index: Int) -> String {
        ["The New York Times", "Spotify", "Bon Appétit", "Netflix", "Lonely Planet"][index % 5]
    }
}

#Preview {
    HomeView()
}
