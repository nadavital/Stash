import SwiftUI

/// The Chat tab - AI-powered search and conversation
/// Features prominent Synapse Lens and thread history
struct ChatView: View {
    @StateObject private var viewModel = SearchViewModel()
    @FocusState private var isSearchFocused: Bool
    @State private var orbExpanded = false
    @State private var showingAddFriend = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Gradient background
                backgroundGradient
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    if viewModel.searchText.isEmpty && viewModel.messages.isEmpty {
                        // Empty state with prominent orb
                        emptyStateView
                    } else if !viewModel.messages.isEmpty {
                        // Conversation view
                        conversationView
                    } else {
                        // Search results
                        searchResultsView
                    }

                    // Input area at bottom
                    inputArea
                }
            }
            .onTapGesture {
                // Dismiss keyboard when tapping outside
                isSearchFocused = false
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Chat")
                        .font(Typography.headline)
                        .foregroundStyle(StashTheme.Color.textPrimary)
                }

                // Add friend button
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Haptics.light()
                        showingAddFriend = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .font(.system(size: 16, weight: .medium))
                    }
                }

                // Keyboard dismiss button when keyboard is visible
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        isSearchFocused = false
                    }
                    .fontWeight(.medium)
                }
            }
            .sheet(isPresented: $showingAddFriend) {
                AddFriendSheet()
            }
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        ZStack {
            StashTheme.Color.bg

            // Subtle glow behind where orb appears
            RadialGradient(
                colors: [
                    StashTheme.Color.accent.opacity(0.06),
                    StashTheme.Color.accent.opacity(0.02),
                    .clear
                ],
                center: .init(x: 0.5, y: 0.25),
                startRadius: 50,
                endRadius: 300
            )
        }
    }

    // MARK: - Empty State (Synapse Lens Front & Center)

    @State private var lensState: SynapseLensState = .idle
    @State private var showLensDemo = false

    private var emptyStateView: some View {
        ScrollView {
            VStack(spacing: Spacing.xxl) {
                Spacer(minLength: 60)

                // The Synapse Lens - large and prominent
                SynapseLensView(size: 200, state: lensState)
                    .onTapGesture {
                        isSearchFocused = true
                    }
                    .onLongPressGesture {
                        Haptics.medium()
                        showLensDemo = true
                    }
                    .sheet(isPresented: $showLensDemo) {
                        LensDemoSheet()
                    }

                // Welcome text
                VStack(spacing: Spacing.sm) {
                    Text("What can I help you find?")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(StashTheme.Color.textPrimary)

                    Text("Search your stash or ask me anything")
                        .font(Typography.body)
                        .foregroundStyle(StashTheme.Color.textSecondary)
                }

                // Quick suggestions as pills
                VStack(spacing: Spacing.lg) {
                    suggestionPills(
                        suggestions: [
                            "What recipes did I save?",
                            "Find articles about design",
                            "Something for date night"
                        ]
                    )

                    suggestionPills(
                        suggestions: [
                            "What would Jake like?",
                            "Show me music",
                            "Recent videos"
                        ]
                    )
                }
                .padding(.top, Spacing.lg)

                Spacer(minLength: 120)
            }
            .padding(.horizontal)
        }
    }

    private func suggestionPills(suggestions: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.sm) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        Haptics.light()
                        viewModel.searchText = suggestion
                        viewModel.sendMessage()
                    } label: {
                        Text(suggestion)
                            .font(Typography.body)
                            .foregroundStyle(StashTheme.Color.textPrimary)
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.sm)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                            .overlay(
                                Capsule()
                                    .stroke(StashTheme.Color.borderSubtle, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Conversation View

    private var conversationView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: Spacing.md) {
                    // Small lens at top of conversation
                    AdaptiveSynapseLens(size: 48, state: lensState)
                        .padding(.vertical, Spacing.md)

                    ForEach(viewModel.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }

                    if viewModel.isLoading {
                        LoadingBubble()
                    }
                }
                .padding()
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                withAnimation {
                    proxy.scrollTo(viewModel.messages.last?.id, anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsView: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.md) {
                ForEach(viewModel.searchResults) { item in
                    SearchResultCard(item: item)
                }
            }
            .padding()
        }
    }

    // MARK: - Input Area

    private var inputArea: some View {
        VStack(spacing: 0) {
            Divider()
                .opacity(0.5)

            HStack(spacing: Spacing.md) {
                // Text input with glass effect
                HStack(spacing: Spacing.sm) {
                    // Stash glyph indicator
                    StashGlyph(size: 22, color: StashTheme.Color.textMuted)

                    TextField("Ask Stash anything...", text: $viewModel.searchText, axis: .vertical)
                        .font(Typography.body)
                        .focused($isSearchFocused)
                        .lineLimit(1...4)
                        .submitLabel(.send)
                        .onSubmit {
                            viewModel.sendMessage()
                        }
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(StashTheme.Color.borderSubtle, lineWidth: 1)
                )

                // Send button
                Button {
                    viewModel.sendMessage()
                } label: {
                    Image(systemName: viewModel.searchText.isEmpty ? "mic.fill" : "arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(
                            viewModel.searchText.isEmpty
                                ? StashTheme.Color.textMuted
                                : StashTheme.Color.accent
                        )
                        .clipShape(Circle())
                }
                .disabled(viewModel.searchText.isEmpty && !viewModel.isVoiceEnabled)
                .animation(.easeInOut(duration: 0.15), value: viewModel.searchText.isEmpty)
            }
            .padding()
            .background(StashTheme.Color.bg.opacity(0.8))
        }
    }
}

// MARK: - Preview

#Preview {
    ChatView()
}
