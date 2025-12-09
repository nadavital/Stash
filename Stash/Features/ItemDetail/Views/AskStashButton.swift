import SwiftUI

/// Floating button to ask Stash about the current item
/// Expands to show suggested prompts, then opens the AI chat sheet
struct AskStashButton: View {
    let item: ItemSummary
    @Binding var showSheet: Bool
    
    @State private var isExpanded = false
    
    private var suggestedPrompts: [String] {
        item.metadata.suggestedPrompts ?? defaultPrompts
    }
    
    private var defaultPrompts: [String] {
        switch item.type {
        case .article:
            return ["Key takeaways?", "Summarize this", "Related reads?"]
        case .recipe:
            return ["Substitution ideas?", "How long to prep?", "Serving tips?"]
        case .song:
            return ["Similar artists?", "What genre?", "More like this?"]
        case .event:
            return ["Event details?", "What to expect?", "How to prepare?"]
        case .youtubeVideo, .youtubeShort, .tiktok, .instagramReel:
            return ["Key points?", "Who made this?", "Similar videos?"]
        default:
            return ["Tell me more", "Why save this?", "Similar items?"]
        }
    }
    
    var body: some View {
        VStack(alignment: .trailing, spacing: Spacing.sm) {
            // Expanded prompts
            if isExpanded {
                VStack(alignment: .trailing, spacing: Spacing.xs) {
                    ForEach(suggestedPrompts.prefix(3), id: \.self) { prompt in
                        Button {
                            Haptics.light()
                            // TODO: Pass prompt to chat
                            showSheet = true
                            isExpanded = false
                        } label: {
                            Text(prompt)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(StashTheme.Color.textPrimary)
                                .padding(.horizontal, Spacing.md)
                                .padding(.vertical, Spacing.sm)
                                .background(StashTheme.Color.surfaceElevated)
                                .clipShape(Capsule())
                                .shadow(color: .black.opacity(0.15), radius: 8, x: 0, y: 2)
                        }
                        .transition(.asymmetric(
                            insertion: .scale.combined(with: .opacity),
                            removal: .opacity
                        ))
                    }
                }
                .padding(.bottom, Spacing.xs)
            }
            
            // Main button with Synapse Lens
            Button {
                Haptics.medium()
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                    if isExpanded {
                        showSheet = true
                        isExpanded = false
                    } else {
                        isExpanded = true
                    }
                }
            } label: {
                HStack(spacing: Spacing.sm) {
                    SynapseLensView(size: 32, state: isExpanded ? .listening : .idle)
                    
                    if isExpanded {
                        Text("Ask anything...")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(StashTheme.Color.textPrimary)
                    }
                }
                .padding(.horizontal, isExpanded ? Spacing.md : Spacing.sm)
                .padding(.vertical, Spacing.sm)
                .background(StashTheme.Color.surfaceElevated)
                .clipShape(Capsule())
                .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 4)
            }
            .buttonStyle(.plain)
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: isExpanded)
    }
}

// MARK: - Ask Stash Sheet

/// Full sheet for AI conversation about an item
struct AskStashSheet: View {
    let item: ItemSummary
    
    @Environment(\.dismiss) private var dismiss
    @State private var inputText = ""
    @State private var messages: [ChatMessage] = []
    @State private var isLoading = false
    @FocusState private var isInputFocused: Bool
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: Spacing.md) {
                            // Context card
                            ItemContextCard(item: item)
                                .padding(.horizontal)
                                .padding(.top)
                            
                            // Suggested prompts if no messages yet
                            if messages.isEmpty {
                                suggestedPromptsSection
                            }
                            
                            // Messages
                            ForEach(messages) { message in
                                MessageRow(message: message)
                                    .id(message.id)
                            }
                            
                            if isLoading {
                                HStack {
                                    SynapseLensView(size: 32, state: .thinking)
                                    Spacer()
                                }
                                .padding(.horizontal)
                            }
                        }
                        .padding(.bottom, Spacing.lg)
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let lastMessage = messages.last {
                            withAnimation {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }
                
                Divider()
                
                // Input area
                HStack(spacing: Spacing.sm) {
                    TextField("Ask about this...", text: $inputText, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(1...4)
                        .focused($isInputFocused)
                        .onSubmit {
                            sendMessage()
                        }
                    
                    Button {
                        sendMessage()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(
                                inputText.isEmpty ? StashTheme.Color.textMuted : StashTheme.Color.accent
                            )
                    }
                    .disabled(inputText.isEmpty || isLoading)
                }
                .padding()
                .background(StashTheme.Color.surface)
            }
            .background(StashTheme.Color.bg)
            .navigationTitle("Ask Stash")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            isInputFocused = true
        }
    }
    
    private var suggestedPromptsSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Try asking")
                .font(.caption)
                .foregroundStyle(StashTheme.Color.textMuted)
                .textCase(.uppercase)
            
            FlowLayout(spacing: Spacing.sm) {
                ForEach(item.metadata.suggestedPrompts ?? [], id: \.self) { prompt in
                    Button {
                        inputText = prompt
                        sendMessage()
                    } label: {
                        Text(prompt)
                            .font(.system(size: 14))
                            .foregroundStyle(StashTheme.Color.textPrimary)
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.sm)
                            .background(StashTheme.Color.surface)
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .padding(.horizontal)
    }
    
    private func sendMessage() {
        guard !inputText.isEmpty else { return }
        
        let userMessage = ChatMessage(
            text: inputText,
            isUser: true
        )
        
        messages.append(userMessage)
        let query = inputText
        inputText = ""
        isLoading = true
        
        // TODO: Call chat-with-stash API with item context
        Task {
            // Simulated response for now
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            
            await MainActor.run {
                let response = ChatMessage(
                    text: "I'd be happy to help with that! Based on \"\(item.title)\", here's what I found...\n\n(This is a placeholder - the real AI response will come from the chat-with-stash API)",
                    isUser: false
                )
                messages.append(response)
                isLoading = false
            }
        }
    }
}

// MARK: - Item Context Card

struct ItemContextCard: View {
    let item: ItemSummary
    
    var body: some View {
        HStack(spacing: Spacing.md) {
            Text(item.primaryEmoji)
                .font(.system(size: 28))
                .frame(width: 48, height: 48)
                .background(StashTheme.Color.surfaceSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(StashTheme.Color.textPrimary)
                    .lineLimit(1)
                
                Text(item.type.displayName)
                    .font(.caption)
                    .foregroundStyle(StashTheme.Color.textMuted)
            }
            
            Spacer()
        }
        .padding(Spacing.md)
        .background(StashTheme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Message Row

struct MessageRow: View {
    let message: ChatMessage
    
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            if message.isUser {
                Spacer(minLength: 60)
            } else {
                SynapseLensView(size: 28, state: .idle)
            }
            
            Text(message.text)
                .font(.system(size: 15))
                .foregroundStyle(message.isUser ? .white : StashTheme.Color.textPrimary)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(
                    message.isUser
                        ? StashTheme.Color.accent
                        : StashTheme.Color.surface
                )
                .clipShape(RoundedRectangle(cornerRadius: 16))
            
            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Preview

#Preview("Ask Stash Button") {
    ZStack {
        Color.black.ignoresSafeArea()
        
        VStack {
            Spacer()
            HStack {
                Spacer()
                AskStashButton(item: .mockArticle, showSheet: .constant(false))
                    .padding()
            }
        }
    }
}

#Preview("Ask Stash Sheet") {
    AskStashSheet(item: .mockArticle)
}
