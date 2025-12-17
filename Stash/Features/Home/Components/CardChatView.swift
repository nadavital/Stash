import SwiftUI

/// AI chat view - card shrinks to top, AI chat appears below
/// Long press card to activate, swipe down or tap card to dismiss
struct CardChatView: View {
    let emoji: String
    let title: String
    let source: String
    let backgroundColor: Color
    let namespace: Namespace.ID
    @Binding var displayMode: CardDisplayMode
    @Binding var cardVerticalOffset: CGFloat

    @State private var inputText = ""
    @State private var messages: [CardChatMessage] = []
    @State private var localDragOffset: CGFloat = 0
    @State private var isInteractiveDragging = false
    @State private var showContent = false
    @State private var scrollOffset: CGFloat = 0

    var body: some View {
        GeometryReader { safeAreaGeometry in
            ZStack(alignment: .top) {
                // Background: Content area (Synapse Lens + messages/prompts)
                VStack(spacing: 0) {
                // Spacing for card at top (miniature is ~100pt tall)
                Spacer()
                    .frame(height: 120)

                VStack(spacing: 0) {
                // Synapse Lens (AI orb)
                AdaptiveSynapseLens(
                    size: 150,
                    state: messages.isEmpty ? .idle : .answering
                )
                .padding(.top, 20)
                .opacity(showContent ? 1 : 0)

                // Message history
                if messages.isEmpty {
                    // Empty state with suggested prompts
                    VStack(spacing: 12) {
                        Text("What would you like to know?")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.bottom, 8)
                            .opacity(showContent ? 1 : 0)

                        ForEach(suggestedPrompts, id: \.self) { prompt in
                            Button {
                                sendMessage(prompt)
                            } label: {
                                Text(prompt)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .frame(maxWidth: .infinity)
                                    .background(.white.opacity(0.1))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .opacity(showContent ? 1 : 0)
                } else {
                    // Message bubbles
                    ScrollView {
                        GeometryReader { geometry in
                            Color.clear.preference(
                                key: ChatScrollOffsetPreferenceKey.self,
                                value: geometry.frame(in: .named("chatScroll")).minY
                            )
                        }
                        .frame(height: 0)

                        VStack(spacing: 16) {
                            ForEach(messages) { message in
                                MessageBubbleView(message: message)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 20)
                    }
                    .coordinateSpace(name: "chatScroll")
                    .onPreferenceChange(ChatScrollOffsetPreferenceKey.self) { value in
                        scrollOffset = value
                    }
                    .opacity(showContent ? 1 : 0)
                }
            }
            .contentShape(Rectangle())
            .simultaneousGesture(dismissGesture)

                Spacer()

                // Input field
                HStack(spacing: 12) {
                    TextField("Ask anything...", text: $inputText)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 22))
                        .foregroundStyle(.white)

                    Button {
                        if !inputText.isEmpty {
                            sendMessage(inputText)
                            inputText = ""
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(inputText.isEmpty ? .gray : .white)
                    }
                    .disabled(inputText.isEmpty)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .opacity(showContent ? 1 : 0)

                // Back button
                Button {
                    showContent = false  // Hide chat content immediately
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        cardVerticalOffset = 0  // Reset to bottom
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
                    colors: [
                        Color(red: 0.1, green: 0.05, blue: 0.2),
                        Color.black
                    ],
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
            .if(!isInteractiveDragging) { view in
                view.matchedGeometryEffect(id: "card-morph", in: namespace)
            }
            .frame(maxWidth: .infinity)  // Center horizontally
            .padding(.horizontal, expansionProgress > 0 ? 0 : 16)
            .onTapGesture {
                if !isInteractiveDragging {
                    showContent = false  // Hide chat content immediately
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        cardVerticalOffset = 0
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

    private var dismissGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard (messages.isEmpty || scrollOffset >= -5) && value.translation.height > 0 else { return }

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
                    // Complete dismiss - hide content immediately, then morph
                    // Keep isInteractiveDragging = true to disable matchedGeometryEffect during dismiss
                    showContent = false  // Hide chat content immediately (no flash)
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) {
                        cardVerticalOffset = 0
                        displayMode = .deck
                    }
                    // ChatView will be removed from hierarchy when displayMode changes, cleaning up state
                } else {
                    // Snap back - re-enable matchedGeometryEffect
                    isInteractiveDragging = false
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        localDragOffset = 0
                    }
                }
            }
    }

    private var suggestedPrompts: [String] {
        [
            "Summarize this in 3 key points",
            "What's the main takeaway?",
            "Who is this for?"
        ]
    }

    private func sendMessage(_ text: String) {
        // Add user message
        let userMessage = CardChatMessage(role: .user, content: text)
        withAnimation {
            messages.append(userMessage)
        }

        // TODO: Call API and add AI response
        // For now, add a placeholder response
        Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            await MainActor.run {
                let aiResponse = CardChatMessage(
                    role: .assistant,
                    content: "This is a placeholder response. The chat API will be integrated soon."
                )
                withAnimation {
                    messages.append(aiResponse)
                }
            }
        }
    }
}

// MARK: - Supporting Types

struct CardChatMessage: Identifiable {
    let id = UUID()
    let role: Role
    let content: String

    enum Role {
        case user
        case assistant
    }
}

struct MessageBubbleView: View {
    let message: CardChatMessage

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer()
            }

            Text(message.content)
                .font(.system(size: 15))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    message.role == .user
                        ? Color.blue.opacity(0.3)
                        : Color.white.opacity(0.1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 18))

            if message.role == .assistant {
                Spacer()
            }
        }
    }
}

// Preference key for tracking scroll position in chat
struct ChatScrollOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

#Preview {
    @Previewable @Namespace var namespace
    @Previewable @State var offset: CGFloat = 0
    CardChatView(
        emoji: "📰",
        title: "How AI is Changing Everything",
        source: "The New York Times",
        backgroundColor: Color(red: 0.8, green: 0.2, blue: 0.2),
        namespace: namespace,
        displayMode: .constant(.chat),
        cardVerticalOffset: $offset
    )
}
