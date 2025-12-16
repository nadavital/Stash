import SwiftUI

/// Ultra-simple card swiper - ONE card visible at a time
/// Swipe left → next card, swipe right → previous card
struct HomeView: View {
    @State private var currentIndex = 0
    @State private var dragOffset: CGFloat = 0
    @State private var rotationAngle: Double = 0
    @State private var scale: CGFloat = 1.0
    @State private var verticalOffset: CGFloat = 0
    @State private var showingAIChat = false
    @State private var showNextCard = true

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

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Background
                Color.black.ignoresSafeArea()

                // NEXT CARD (visible underneath when swiping away current)
                nextCard(screenWidth: geometry.size.width)

                // CURRENT CARD
                currentCard(screenWidth: geometry.size.width)

                // PREVIOUS CARD (slides on top when swiping right)
                if showPreviousCard && currentIndex > 0 {
                    previousCard(screenWidth: geometry.size.width)
                }

                // Floating controls overlay
                floatingControls
            }
        }
        .ignoresSafeArea()
        .sheet(isPresented: $showingAIChat) {
            VStack(spacing: 20) {
                Text("Ask Stash About This")
                    .font(.system(size: 24, weight: .bold))

                Text("💬 AI Chat Interface")
                    .font(.system(size: 18))
                    .foregroundStyle(.secondary)

                Button("Close") {
                    showingAIChat = false
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Cards

    private func cardContent(for index: Int) -> some View {
        ZStack(alignment: .bottom) {
            // Background color
            testColors[index % testColors.count]

            // Content
            VStack(alignment: .leading, spacing: 12) {
                Spacer()

                Text(mockEmoji(for: index))
                    .font(.system(size: 32))

                Text(mockTitle(for: index))
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .shadow(color: .black.opacity(0.3), radius: 8, y: 4)

                Text(mockSource(for: index))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 120)
        }
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }

    private func nextCard(screenWidth: CGFloat) -> some View {
        cardContent(for: currentIndex + 1)
            .id("card-\(currentIndex + 1)")
    }

    private func currentCard(screenWidth: CGFloat) -> some View {
        cardContent(for: currentIndex)
            .id("card-\(currentIndex)")
            .scaleEffect(scale)
            .rotationEffect(.degrees(rotationAngle))
            .offset(x: dragOffset, y: verticalOffset)
            .gesture(
                DragGesture()
                    .onChanged { value in
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
                    .onEnded { value in
                        handleSwipe(value: value, screenWidth: screenWidth)
                    }
            )
            .onTapGesture(count: 2) {
                Haptics.medium()
                showingAIChat = true
            }
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
