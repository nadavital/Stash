import SwiftUI

/// Card display modes for transitions
enum CardDisplayMode {
    case deck      // Normal card in deck
    case detail    // Expanded to detail view
    case chat      // Morphed into AI chat
}

struct HomeView: View {
    @State private var viewModel = HomeViewModel()
    @State private var currentIndex = 0
    @State private var displayMode: CardDisplayMode = .deck
    @State private var showControls = true
    @Namespace private var glassNamespace

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
    @State private var isHorizontalDragging = false

    // Race condition prevention flags
    @State private var isHorizontalTransitioning = false
    @State private var isVerticalTransitioning = false

    // Background morphing during horizontal transitions
    @State private var backgroundMorphProgress: Double = 0.0

    // Sheet presentation state
    @State private var showingAddItem = false
    @State private var showingChat = false
    @State private var showingProfile = false

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
                // Background - uses system background for adaptive light/dark
                Color(.systemBackground).ignoresSafeArea()

                // Show content only when items loaded
                if !viewModel.items.isEmpty {
                    ZStack(alignment: .top) {
                        // MAIN CARD STACK - contains all cards and transitions
                        mainCardStack(screenHeight: geometry.size.height, screenWidth: geometry.size.width)
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
                    .onChange(of: currentIndex) { oldValue, newValue in
                        // Pre-load adjacent card images
                        Task {
                            await preloadAdjacentImages()
                        }
                    }
                }

                // Loading state
                if viewModel.isLoading && viewModel.items.isEmpty {
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.5)
                            .tint(.white)
                        Text("Loading your stash...")
                            .font(.system(size: 17))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }

                // Empty state
                if !viewModel.isLoading && viewModel.items.isEmpty {
                    VStack(spacing: 16) {
                        Text("🎴")
                            .font(.system(size: 64))
                        Text("Your deck is empty")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(.white)
                        Text("Tap + below to add your first item")
                            .font(.system(size: 17))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }

                // CONTROLS - Always show in deck mode
                if displayMode == .deck {
                    floatingControls
                        .opacity(showControls ? (1.0 - transitionProgress) : 0)
                        .zIndex(200)
                }
            }
        }
        .ignoresSafeArea()
        .task {
            await viewModel.loadFeed()
            // Pre-load initial images
            await preloadAdjacentImages()
        }
        .sheet(isPresented: $showingAddItem) {
            AddItemSheet()
        }
        .sheet(isPresented: $showingChat) {
            ChatView()
        }
        .sheet(isPresented: $showingProfile) {
            DebugProfileView {
                // Callback to refresh home feed when debug view refreshes
                await viewModel.loadFeed()
            }
        }
    }

    // MARK: - Main Card Stack

    @ViewBuilder
    private func mainCardStack(screenHeight: CGFloat, screenWidth: CGFloat) -> some View {
        let isVerticalGesture = detectedDirection.isVertical || isDragging

        ZStack(alignment: .top) {
            // BACKGROUND MORPHING LAYER (Detail mode only)
            // Dual-layer crossfade system for smooth background transitions
            if displayMode == .detail {
                ZStack {
                    // Base layer: current item background
                    itemBackground(for: currentIndex)
                        .opacity(1.0 - abs(backgroundMorphProgress))
                        .ignoresSafeArea()

                    // Transition layer: previous/next background
                    Group {
                        if backgroundMorphProgress < 0, currentIndex > 0 {
                            // Swiping right → show previous background
                            itemBackground(for: currentIndex - 1)
                                .opacity(abs(backgroundMorphProgress))
                                .ignoresSafeArea()
                        } else if backgroundMorphProgress > 0 {
                            // Swiping left → show next background
                            itemBackground(for: currentIndex + 1)
                                .opacity(abs(backgroundMorphProgress))
                                .ignoresSafeArea()
                        }
                    }
                }
                .zIndex(-1)  // Behind all content
                .animation(.none, value: backgroundMorphProgress)  // No animation during drag
            }

            // DECK MODE: Background cards
            // Only show background cards when fully in deck mode (transitionProgress = 0)
            if displayMode == .deck && transitionProgress == 0 {
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

            // DETAIL CONTENT - Always rendered for smooth transitions
            // In deck mode, it's behind the full-height card and invisible
            // In detail mode, it's revealed as the card shrinks upward
            // Stays visible during entire transition (even during spring animation back to deck)
            detailContent()
                .opacity((isDragging || displayMode == .detail || transitionProgress > 0) ? 1 : 0)
                .animation(.none, value: isDragging)
                .animation(StashTheme.Gesture.completionSpring, value: displayMode)
                .zIndex(0)

            // DETAIL MODE: Additional cards for horizontal navigation
            // Always render both cards, use opacity for smooth fade-in
            if displayMode == .detail {
                let screenWidth = UIScreen.main.bounds.width

                // Next card (slides in from right when swiping left)
                let nextCardProgress = detailHorizontalDragOffset <= 0 ? min(abs(detailHorizontalDragOffset) / screenWidth, 1.0) : 0
                detailCard(for: currentIndex + 1, screenHeight: screenHeight)
                    .offset(x: screenWidth + detailHorizontalDragOffset)
                    .opacity(nextCardProgress)  // Gradual fade-in as it slides
                    .zIndex(1)

                // Previous card (slides in from left when swiping right)
                if currentIndex > 0 {
                    let previousCardProgress = detailHorizontalDragOffset >= 0 ? min(abs(detailHorizontalDragOffset) / screenWidth, 1.0) : 0
                    detailCard(for: currentIndex - 1, screenHeight: screenHeight)
                        .offset(x: -screenWidth + detailHorizontalDragOffset)
                        .opacity(previousCardProgress)  // Gradual fade-in as it slides
                        .zIndex(1)
                }
            }

            // MAIN CARD - Single card that morphs between modes
            MorphingCard(
                emoji: emoji(for: currentIndex),
                title: title(for: currentIndex),
                source: source(for: currentIndex),
                summary: summary(for: currentIndex),
                type: type(for: currentIndex),
                sharedByUser: sharedByUser(for: currentIndex),
                background: itemBackground(for: currentIndex),
                onAction: cardAction(for: currentIndex)
            )
            .animation(.none, value: currentIndex)  // Disable animations on card content
            .frame(height: cardHeight(screenHeight: screenHeight), alignment: .top)
            .clipped()
            .ignoresSafeArea(.container, edges: .top)
            .scaleEffect(displayMode == .deck ? currentCardScale : 1.0)
            .offset(x: displayMode == .deck ? currentCardOffset : (isVerticalGesture ? 0 : detailHorizontalDragOffset))
            .rotationEffect(.degrees(displayMode == .deck ? currentCardRotation : 0))
            .allowsHitTesting(true)
            .onTapGesture {
                if displayMode == .deck {
                    expandToDetail()
                }
            }
            .id("card-\(currentIndex)")  // Force new view instance when index changes
            .zIndex(100)

            // FLOATING CARD OVERLAYS - Glass pill and action button (deck mode only)
            if displayMode == .deck && transitionProgress == 0 {
                floatingCardOverlays
                    .zIndex(200)
            }
        }
    }

    // Helper to create a detail mode card
    @ViewBuilder
    private func detailCard(for index: Int, screenHeight: CGFloat) -> some View {
        MorphingCard(
            emoji: emoji(for: index),
            title: title(for: index),
            source: source(for: index),
            summary: summary(for: index),
            type: type(for: index),
            sharedByUser: sharedByUser(for: index),
            background: itemBackground(for: index),
            onAction: cardAction(for: index)
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

        // Always interpolate using transitionProgress for smooth animations
        // transitionProgress: 0 = deck (full height), 1 = detail (collapsed height)
        return deckHeight - (deckHeight - detailHeight) * transitionProgress
    }

    // MARK: - Detail Content

    @ViewBuilder
    private func detailContent() -> some View {
        if let item = viewModel.items[safe: currentIndex] {
            DetailScrollContent(
                item: item,
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
                canNavigateNext: currentIndex < viewModel.items.count - 1,
                canNavigatePrevious: currentIndex > 0
            )
        }
    }

    // MARK: - Card Views

    private func nextCard() -> some View {
        MorphingCard(
            emoji: emoji(for: currentIndex + 1),
            title: title(for: currentIndex + 1),
            source: source(for: currentIndex + 1),
            summary: summary(for: currentIndex + 1),
            type: type(for: currentIndex + 1),
            sharedByUser: sharedByUser(for: currentIndex + 1),
            background: itemBackground(for: currentIndex + 1),
            onAction: cardAction(for: currentIndex + 1)
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func previousCard(screenWidth: CGFloat) -> some View {
        MorphingCard(
            emoji: emoji(for: currentIndex - 1),
            title: title(for: currentIndex - 1),
            source: source(for: currentIndex - 1),
            summary: summary(for: currentIndex - 1),
            type: type(for: currentIndex - 1),
            sharedByUser: sharedByUser(for: currentIndex - 1),
            background: itemBackground(for: currentIndex - 1),
            onAction: cardAction(for: currentIndex - 1)
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

    @ViewBuilder
    private func itemBackground(for index: Int) -> some View {
        if let item = viewModel.items[safe: index] {
            let colors = backgroundColors(for: item.type)

            // Show image if available, otherwise gradient
            if let iconUrlString = item.metadata.iconUrl,
               let iconUrl = URL(string: iconUrlString) {
                // GeometryReader ensures we know the exact size available
                GeometryReader { geometry in
                    CachedAsyncImage(url: iconUrl) { image in
                        ZStack {
                            Color.black
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: geometry.size.width, height: geometry.size.height)
                                .clipped()
                            LinearGradient(
                                colors: [.black.opacity(0.3), .black.opacity(0.8)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        }
                    } placeholder: {
                        ZStack {
                            Color.black
                            LinearGradient(
                                colors: [colors.primary, .black],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        }
                    }
                }
            } else {
                ZStack {
                    Color.black
                    LinearGradient(
                        colors: [colors.primary, .black],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
            }
        } else {
            testBackground(for: index)
        }
    }

    private func backgroundColors(for type: EntityType) -> (primary: Color, secondary: Color) {
        switch type {
        case .article:
            return (Color(red: 0.2, green: 0.4, blue: 0.8), .black)  // Blue
        case .song:
            return (Color(red: 0.9, green: 0.5, blue: 0.1), .black)  // Orange
        case .recipe:
            return (Color(red: 0.2, green: 0.7, blue: 0.3), .black)  // Green
        case .event:
            return (Color(red: 0.6, green: 0.2, blue: 0.8), .black)  // Purple
        case .tweet, .instagramPost, .threadsPost:
            return (Color(red: 0.8, green: 0.2, blue: 0.4), .black)  // Pink
        case .youtubeVideo, .youtubeShort, .tiktok:
            return (Color(red: 0.8, green: 0.2, blue: 0.2), .black)  // Red
        default:
            return (Color(red: 0.4, green: 0.4, blue: 0.4), .black)  // Gray
        }
    }

    // MARK: - Controls

    private var floatingControls: some View {
        VStack {
            // Top: Profile button
            HStack {
                Spacer()
                Button {
                    Haptics.light()
                    showingProfile = true
                } label: {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                }
                .padding(.trailing, 20)
            }
            .padding(.top, 60)

            Spacer()

            // Bottom: Add button (left), Action button (center), AI orb (right)
            HStack(alignment: .bottom, spacing: 0) {
                // Add button
                Button {
                    Haptics.light()
                    showingAddItem = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.white)
                        .background(Circle().fill(.black.opacity(0.3)).frame(width: 56, height: 56))
                }

                Spacer()

                // Action button (center) - always visible
                CardActionButton(
                    type: type(for: currentIndex),
                    action: cardAction(for: currentIndex) ?? { expandToDetail() }
                )

                Spacer()

                // Synapse Lens (AI orb)
                Button {
                    Haptics.light()
                    showingChat = true
                } label: {
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

        // Prevent gesture handling during transitions
        guard !isHorizontalTransitioning && !isVerticalTransitioning else { return }

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
                currentCardRotation = Double(translation / screenWidth) * StashTheme.Gesture.rotationAngle
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
                    }

                    // Only set isDragging to false after animation completes
                    // so detail content stays visible during spring back
                    Task { @MainActor in
                        try? await Task.sleep(for: .seconds(StashTheme.Gesture.completionDelay))
                        isDragging = false
                    }

                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }

        case .horizontal(let left):
            let threshold = screenWidth * 0.25
            if left && value.translation.width < -threshold && currentIndex < viewModel.items.count - 1 {
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
        guard !isVerticalTransitioning else { return }
        isVerticalTransitioning = true

        let isHighVelocity = transitionProgress > 0.5

        // Hide next card immediately to prevent it from showing during transitions
        showNextCard = false

        withAnimation(isHighVelocity
            ? Animation.spring(response: 0.28, dampingFraction: 0.84)
            : StashTheme.Gesture.completionSpring) {
            displayMode = .detail
            transitionProgress = 1.0
            isDragging = false
            showControls = false
        }

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(StashTheme.Gesture.detailTransitionDelay))
            isVerticalTransitioning = false
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func collapseToCard() {
        guard !isVerticalTransitioning else { return }
        isVerticalTransitioning = true

        withAnimation(StashTheme.Gesture.completionSpring) {
            displayMode = .deck
            transitionProgress = 0
            showControls = true
        }

        // Delay isDragging and showNextCard until animation completes
        // This keeps detail content visible during the entire transition
        Task { @MainActor in
            // Reduced delay for faster re-expand responsiveness
            try? await Task.sleep(for: .milliseconds(150))
            isDragging = false
            showNextCard = true
            isVerticalTransitioning = false
        }

        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    // MARK: - Navigation Helpers

    private func navigateToNextCard(screenWidth: CGFloat) {
        guard !isHorizontalTransitioning else { return }
        guard currentIndex < viewModel.items.count - 1 else { return }  // Bounds check
        isHorizontalTransitioning = true

        withAnimation(StashTheme.Gesture.completionSpring) {
            currentCardOffset = -screenWidth * 1.5
            currentCardRotation = -25
            currentCardScale = 0.7
        }

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(StashTheme.Gesture.detailTransitionDelay))
            guard isHorizontalTransitioning else { return }

            // Reset card position without animation
            var transaction = Transaction(animation: .none)
            withTransaction(transaction) {
                currentCardOffset = 0
                currentCardRotation = 0
                currentCardScale = 1.0
                isHorizontalTransitioning = false
            }

            // Update index - glass overlays will animate via .glassEffectTransition
            currentIndex += 1
        }
    }

    private func navigateToPreviousCard(screenWidth: CGFloat) {
        guard !isHorizontalTransitioning else { return }
        guard currentIndex > 0 else { return }  // Bounds check
        isHorizontalTransitioning = true

        withAnimation(StashTheme.Gesture.completionSpring) {
            previousCardOffset = 0
            previousCardRotation = 0
            previousCardScale = 1.0
        }

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(StashTheme.Gesture.detailTransitionDelay))
            guard isHorizontalTransitioning else { return }

            // Reset card position without animation
            var transaction = Transaction(animation: .none)
            withTransaction(transaction) {
                showPreviousCard = false
                previousCardOffset = -screenWidth * 1.5
                previousCardRotation = -25
                previousCardScale = 0.7
                isHorizontalTransitioning = false
            }

            // Update index - glass overlays will animate via .glassEffectTransition
            currentIndex -= 1
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
                try? await Task.sleep(for: .seconds(StashTheme.Gesture.completionDelay))
                showPreviousCard = false
            }
        }
    }

    // MARK: - Detail Horizontal Drag Handlers

    private func handleDetailHorizontalDragChanged(offset: CGFloat, isLeft: Bool) {
        // Prevent gesture updates during active transitions
        guard !isHorizontalTransitioning else { return }

        // Update offset and background morph progress
        let screenWidth = UIScreen.main.bounds.width
        let progress = offset / screenWidth  // Range: -1.0 to 1.0

        detailHorizontalDragOffset = offset
        backgroundMorphProgress = progress
    }

    private func handleDetailHorizontalDragEnded(offset: CGFloat, isLeft: Bool) {
        guard !isHorizontalTransitioning else { return }

        let screenWidth = UIScreen.main.bounds.width
        let threshold = screenWidth * StashTheme.Gesture.horizontalSwipeThreshold

        if isLeft && abs(offset) > threshold && currentIndex < viewModel.items.count - 1 {
            // Commit: slide to next
            isHorizontalTransitioning = true

            withAnimation(StashTheme.Gesture.completionSpring) {
                detailHorizontalDragOffset = -screenWidth
                backgroundMorphProgress = 1.0  // Complete morph to next
            }

            Task { @MainActor in
                try? await Task.sleep(for: .seconds(StashTheme.Gesture.detailTransitionDelay))
                guard isHorizontalTransitioning else { return }

                // Reset everything atomically - no animation
                scrollToTopTrigger = UUID()
                detailHorizontalDragOffset = 0
                backgroundMorphProgress = 0.0
                currentIndex += 1
                isHorizontalTransitioning = false

                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }

        } else if !isLeft && abs(offset) > threshold && currentIndex > 0 {
            // Commit: slide to previous
            isHorizontalTransitioning = true

            withAnimation(StashTheme.Gesture.completionSpring) {
                detailHorizontalDragOffset = screenWidth
                backgroundMorphProgress = -1.0  // Complete morph to previous
            }

            Task { @MainActor in
                try? await Task.sleep(for: .seconds(StashTheme.Gesture.detailTransitionDelay))
                guard isHorizontalTransitioning else { return }

                // Reset everything atomically - no animation
                scrollToTopTrigger = UUID()
                detailHorizontalDragOffset = 0
                backgroundMorphProgress = 0.0
                currentIndex -= 1
                isHorizontalTransitioning = false

                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }

        } else {
            // Cancel: spring back
            withAnimation(StashTheme.Gesture.cancelSpring) {
                detailHorizontalDragOffset = 0
                backgroundMorphProgress = 0.0  // Reset morph
            }

            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    // MARK: - Data Accessors

    private func emoji(for index: Int) -> String {
        viewModel.items[safe: index]?.primaryEmoji ?? "📄"
    }

    private func title(for index: Int) -> String {
        viewModel.items[safe: index]?.title ?? "Untitled"
    }

    private func source(for index: Int) -> String {
        viewModel.items[safe: index]?.sourceLabel ?? "STASH"
    }

    private func summary(for index: Int) -> String {
        viewModel.items[safe: index]?.summary ?? ""
    }

    private func type(for index: Int) -> EntityType {
        viewModel.items[safe: index]?.type ?? .generic
    }

    private func sharedByUser(for index: Int) -> ItemSummary.SharedByUser? {
        viewModel.items[safe: index]?.sharedByUser
    }

    private func cardAction(for index: Int) -> (() -> Void)? {
        guard let item = viewModel.items[safe: index] else { return nil }

        switch item.type {
        case .song:
            // TODO: Play music preview
            return {
                print("🎵 Play preview for: \(item.title)")
                // Future: Play previewUrl
            }
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel:
            // TODO: Play video inline or expand to detail
            return {
                print("▶️ Play video: \(item.title)")
                expandToDetail()
            }
        default:
            return nil  // No quick action for other types
        }
    }

    // MARK: - Floating Card Overlays

    private var floatingCardOverlays: some View {
        GlassEffectContainer(spacing: 40.0) {
            VStack(alignment: .leading, spacing: 0) {
                // Glass pill at top-left
                HStack {
                    CardGlassPill(
                        emoji: emoji(for: currentIndex),
                        type: type(for: currentIndex),
                        source: source(for: currentIndex),
                        sharedByUser: sharedByUser(for: currentIndex)
                    )
                    .padding(.top, 60)
                    .padding(.leading, 24)
                    Spacer()
                }

                Spacer()
            }
            .allowsHitTesting(true)
        }
    }

    // MARK: - Image Pre-loading

    private func preloadAdjacentImages() async {
        // Pre-load previous, current, and next images
        let indicesToPreload = [currentIndex - 1, currentIndex, currentIndex + 1]

        for index in indicesToPreload {
            guard let item = viewModel.items[safe: index],
                  let iconUrlString = item.metadata.iconUrl else {
                continue
            }

            await ImageCache.shared.preload(iconUrlString)
        }
    }
}

#Preview {
    HomeView()
}
