import SwiftUI

/// Card display modes for morphing transitions
enum CardDisplayMode {
    case deck      // Normal card in deck
    case detail    // Expanded to detail view
    case chat      // Morphed into AI chat
}

/// Ultra-simple card swiper - ONE card visible at a time
/// Swipe left → next card, swipe right → previous card
/// Tap or swipe up → morph to detail view
/// Long press → morph to AI chat
struct HomeView: View {
    @State private var currentIndex = 0
    @State private var dragOffset: CGFloat = 0
    @State private var rotationAngle: Double = 0
    @State private var scale: CGFloat = 1.0
    @State private var verticalOffset: CGFloat = 0
    @State private var displayMode: CardDisplayMode = .deck
    @State private var showNextCard = true
    @State private var showControls = true  // Fade controls during morphing

    // For morphing animation - explicit vertical translation
    @State private var cardVerticalOffset: CGFloat = 0

    // For animating previous card sliding back on top
    @State private var previousCardOffset: CGFloat = 0
    @State private var previousCardRotation: Double = 0
    @State private var previousCardScale: CGFloat = 0.95
    @State private var previousCardVerticalOffset: CGFloat = 20
    @State private var showPreviousCard = false

    // Test colors
    private let testColors: [Color] = [
        Color(red: 0.8, green: 0.2, blue: 0.2), // Red
        Color(red: 0.2, green: 0.4, blue: 0.8), // Blue
        Color(red: 0.2, green: 0.7, blue: 0.3), // Green
        Color(red: 0.9, green: 0.5, blue: 0.1), // Orange
        Color(red: 0.6, green: 0.2, blue: 0.8)  // Purple
    ]

    @Namespace private var cardTransition

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                // Display content based on current mode
                ZStack {
                    // Background layer: Detail/Chat views
                    if displayMode == .detail {
                        CardDetailView(
                            emoji: mockEmoji(for: currentIndex),
                            title: mockTitle(for: currentIndex),
                            source: mockSource(for: currentIndex),
                            backgroundColor: testColors[currentIndex % testColors.count],
                            namespace: cardTransition,
                            displayMode: $displayMode,
                            cardVerticalOffset: $cardVerticalOffset
                        )
                        .zIndex(0)
                        .transition(.identity)
                    }

                    if displayMode == .chat {
                        CardChatView(
                            emoji: mockEmoji(for: currentIndex),
                            title: mockTitle(for: currentIndex),
                            source: mockSource(for: currentIndex),
                            backgroundColor: testColors[currentIndex % testColors.count],
                            namespace: cardTransition,
                            displayMode: $displayMode,
                            cardVerticalOffset: $cardVerticalOffset
                        )
                        .zIndex(0)
                        .transition(.identity)
                    }

                    // Middle layer: Next card (only when stable in deck mode)
                    if displayMode == .deck && abs(cardVerticalOffset) < 1 && showNextCard {
                        nextCard(screenWidth: geometry.size.width)
                            .zIndex(1)
                    }

                    // Top layer: Morphing current card (ONLY in deck mode)
                    if displayMode == .deck {
                        currentCard(screenWidth: geometry.size.width)
                            .zIndex(2)
                    }

                    // Deck-specific elements
                    if displayMode == .deck {
                        // Previous card (slides on top when swiping right)
                        if showPreviousCard && currentIndex > 0 {
                            previousCard(screenWidth: geometry.size.width)
                                .zIndex(3)
                        }

                        // Floating controls (only in deck mode)
                        floatingControls
                            .zIndex(4)
                            .opacity(showControls ? 1 : 0)
                    }
                }
            }
        }
        .ignoresSafeArea()
        .onChange(of: displayMode) { oldValue, newValue in
            // When leaving deck mode, hide controls and next card
            if newValue != .deck && oldValue == .deck {
                showControls = false
                showNextCard = false
            }

            // When returning to deck mode, restore next card and controls with delay
            if newValue == .deck && oldValue != .deck {
                // Show controls immediately (0.2s fade)
                withAnimation(.easeIn(duration: 0.2)) {
                    showControls = true
                }
                // Show next card after morph completes
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    showNextCard = true
                }
            }
        }
    }

    // MARK: - Cards

    private func cardContent(for index: Int) -> some View {
        CardContent(
            emoji: mockEmoji(for: index),
            title: mockTitle(for: index),
            source: mockSource(for: index),
            backgroundColor: testColors[index % testColors.count],
            isFullScreen: true
        )
    }

    private func nextCard(screenWidth: CGFloat) -> some View {
        cardContent(for: currentIndex + 1)
            .id("card-\(currentIndex + 1)")
    }

    private func currentCard(screenWidth: CGFloat) -> some View {
        // Card morphs between full-screen (deck) and miniature (detail/chat)
        CardContent(
            emoji: mockEmoji(for: currentIndex),
            title: mockTitle(for: currentIndex),
            source: mockSource(for: currentIndex),
            backgroundColor: testColors[currentIndex % testColors.count],
            isFullScreen: displayMode == .deck,  // Miniature when in detail/chat
            onTap: displayMode != .deck ? {
                // Tap miniature card to dismiss back to deck
                withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                    cardVerticalOffset = 0
                    displayMode = .deck
                }
            } : nil
        )
            .id("card-\(currentIndex)")
            .matchedGeometryEffect(id: "card-morph", in: cardTransition)
            .padding(.horizontal, displayMode == .deck ? 0 : 16)
            .padding(.top, displayMode == .deck ? 0 : 80)
            .offset(y: cardVerticalOffset)  // Explicit vertical position for morph animation
            // Only apply deck-mode transforms when in deck mode
            .if(displayMode == .deck) { view in
                view
                    .scaleEffect(scale)
                    .rotationEffect(.degrees(rotationAngle))
                    .offset(x: dragOffset, y: verticalOffset)
            }
            .onTapGesture {
                // Tap to open detail view
                // Reset transforms first for clean morphing
                dragOffset = 0
                rotationAngle = 0
                scale = 1.0
                verticalOffset = 0

                withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                    // Calculate offset to move card from bottom to top
                    // Negative value moves up
                    cardVerticalOffset = -(screenWidth - 180)  // Approximate miniature card height
                    displayMode = .detail
                }
            }
            .onLongPressGesture(minimumDuration: 0.5) {
                // Long press to open AI chat
                Haptics.medium()
                // Reset transforms first for clean morphing
                dragOffset = 0
                rotationAngle = 0
                scale = 1.0
                verticalOffset = 0

                withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                    // Calculate offset to move card from bottom to top
                    cardVerticalOffset = -(screenWidth - 180)
                    displayMode = .chat
                }
            }
            .simultaneousGesture(
                DragGesture()
                    .onChanged { value in
                        // Only handle gestures in deck mode
                        guard displayMode == .deck else { return }

                        // Determine gesture direction
                        let isHorizontal = abs(value.translation.width) > abs(value.translation.height)
                        let isVerticalUp = value.translation.height < -30 && abs(value.translation.width) < 50

                        if isVerticalUp {
                            // Swiping UP - preview detail mode (optional animation)
                            // Could add subtle preview animation here
                        } else if isHorizontal {
                            // Horizontal swipe - navigate cards
                            if value.translation.width < 0 {
                                // Swiping LEFT - animate current card
                                dragOffset = value.translation.width
                                let rotationAmount = Double(value.translation.width / screenWidth) * 15
                                rotationAngle = rotationAmount
                                let dragProgress = abs(value.translation.width) / screenWidth
                                scale = 1.0 - (dragProgress * 0.1)
                            } else if value.translation.width > 0 && currentIndex > 0 {
                                // Swiping RIGHT - animate previous card sliding on top from LEFT
                                let dragProgress = value.translation.width / screenWidth
                                showPreviousCard = true
                                previousCardOffset = -screenWidth * (1.0 - dragProgress)
                                previousCardRotation = -25 * (1.0 - dragProgress)
                                previousCardScale = 0.7 + (0.3 * dragProgress)
                                previousCardVerticalOffset = 100 * (1.0 - dragProgress)
                            }
                        }
                    }
                    .onEnded { value in
                        // Only handle gestures in deck mode
                        guard displayMode == .deck else { return }

                        // Check for vertical swipe up first
                        let isVerticalUp = value.translation.height < -100 && abs(value.translation.width) < 80

                        if isVerticalUp {
                            // Swiped UP - open detail view
                            // Reset transforms first for clean morphing
                            dragOffset = 0
                            rotationAngle = 0
                            scale = 1.0
                            verticalOffset = 0

                            withAnimation(.spring(response: 0.4, dampingFraction: 0.82)) {
                                // Calculate offset to move card from bottom to top
                                cardVerticalOffset = -(screenWidth - 180)
                                displayMode = .detail
                            }
                        } else {
                            // Handle horizontal swipe
                            handleSwipe(value: value, screenWidth: screenWidth)
                        }
                    }
            )
    }

    private func previousCard(screenWidth: CGFloat) -> some View {
        cardContent(for: currentIndex - 1)
            .scaleEffect(previousCardScale)
            .rotationEffect(.degrees(previousCardRotation))
            .offset(x: previousCardOffset, y: previousCardVerticalOffset)
    }

    // MARK: - Floating Controls

    private var floatingControls: some View {
        VStack {
            // Top toolbar
            HStack {
                Spacer()

                Button {
                    // TODO: Open profile
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

            // Bottom buttons
            HStack {
                Button {
                    // TODO: Add item
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 56))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                }
                .padding(.leading, 20)

                Spacer()

                Button {
                    // TODO: Open AI chat
                } label: {
                    AdaptiveSynapseLens(size: 56, state: .idle)
                }
                .padding(.trailing, 20)
            }
            .padding(.bottom, 32)
        }
    }

    // MARK: - Gesture Handling

    private func handleSwipe(value: DragGesture.Value, screenWidth: CGFloat) {
        let threshold: CGFloat = screenWidth * 0.25

        if value.translation.width < -threshold {
            // Swiped LEFT → discard current card off the deck
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                dragOffset = -screenWidth * 1.5
                rotationAngle = -25
                scale = 0.7
                verticalOffset = 100
            }

            // After animation, move to next card
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                currentIndex += 1
                // Reset current card state for next card
                dragOffset = 0
                rotationAngle = 0
                scale = 1.0
                verticalOffset = 0
                // Reset display mode to deck
                displayMode = .deck
            }
        } else if value.translation.width > threshold && currentIndex > 0 {
            // Swiped RIGHT → previous card slides on top from LEFT and becomes current
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                previousCardOffset = 0
                previousCardRotation = 0
                previousCardScale = 1.0
                previousCardVerticalOffset = 0
            }

            // After animation, update index and hide previous card
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                currentIndex -= 1
                showPreviousCard = false
                // Reset previous card state (starts from left side)
                previousCardOffset = -screenWidth * 1.5
                previousCardRotation = -25
                previousCardScale = 0.7
                previousCardVerticalOffset = 100
                // Reset display mode to deck
                displayMode = .deck
            }
        } else {
            // Snap back to center
            if value.translation.width < 0 {
                // Was swiping left, snap current card back
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    dragOffset = 0
                    rotationAngle = 0
                    scale = 1.0
                    verticalOffset = 0
                }
            } else {
                // Was swiping right, hide previous card back to left
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    previousCardOffset = -screenWidth * 1.5
                    previousCardRotation = -25
                    previousCardScale = 0.7
                    previousCardVerticalOffset = 100
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    showPreviousCard = false
                }
            }
        }
    }

    // MARK: - Mock Data

    private func mockEmoji(for index: Int) -> String {
        let emojis = ["📰", "🎵", "🍝", "🎬", "✈️"]
        return emojis[index % emojis.count]
    }

    private func mockTitle(for index: Int) -> String {
        let titles = [
            "How AI is Changing Everything",
            "Best Songs of the Year",
            "Perfect Pasta Carbonara Recipe",
            "Must-Watch Documentary",
            "Travel Guide to Iceland"
        ]
        return titles[index % titles.count]
    }

    private func mockSource(for index: Int) -> String {
        let sources = ["The New York Times", "Spotify", "Bon Appétit", "Netflix", "Lonely Planet"]
        return sources[index % sources.count]
    }
}

#Preview {
    HomeView()
}
